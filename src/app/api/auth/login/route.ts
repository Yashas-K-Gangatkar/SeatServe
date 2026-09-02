// POST /api/auth/login — staff portal sign-in (email + password).
// Sets an httpOnly session cookie; response contains the scoped profile only.
// Audit fix #29: naive in-memory rate limiting — 5 failed attempts per
// email+IP within 10 minutes → 429. (Redis-backed limiter is Phase 3/4.)
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { SESSION_COOKIE, hashSessionToken, newSessionToken, sessionExpiry, verifyPassword } from '@/lib/auth'
import { sessionCookieOptions } from '@/lib/auth-server'
import { audit } from '@/lib/audit'

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  // .trim(): the #1 real-world login failure is a paste accident — a trailing
  // space/newline from copying credentials out of a chat or notes app.
  password: z.string().trim().min(1, 'Password is required'),
})

const LOGIN_WINDOW_MS = 10 * 60_000
const LOGIN_MAX_FAILS = 5
const loginFails = new Map<string, { count: number; resetAt: number }>()

function loginTooManyAttempts(key: string): number {
  const entry = loginFails.get(key)
  if (!entry || entry.resetAt < Date.now()) return 0
  return entry.count
}
function recordLoginFail(key: string): void {
  const entry = loginFails.get(key)
  if (!entry || entry.resetAt < Date.now()) {
    loginFails.set(key, { count: 1, resetAt: Date.now() + LOGIN_WINDOW_MS })
    return
  }
  entry.count += 1
}
function clearLoginFails(key: string): void {
  loginFails.delete(key)
}

export async function POST(request: Request) {
  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error
  const { email, password } = parsed.data

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  const failKey = `${email}|${ip}`
  if (loginTooManyAttempts(failKey) >= LOGIN_MAX_FAILS) {
    return fail('Too many failed attempts — try again in 10 minutes', 429)
  }

  const user = await db.user.findUnique({ where: { email } })
  if (!user || !user.passwordHash) {
    recordLoginFail(failKey)
    return fail('Invalid email or password', 401)
  }
  if (!user.isActive) return fail('This account is deactivated — contact your mall admin', 403)
  if (!['MALL_ADMIN', 'CINEMA_MANAGER', 'STORE_MANAGER', 'KITCHEN_STAFF', 'RUNNER'].includes(user.role)) {
    return fail('This account is not a staff account', 403)
  }

  const passwordOk = await verifyPassword(password, user.passwordHash)
  if (!passwordOk) {
    recordLoginFail(failKey)
    await audit({
      actorRole: 'SYSTEM',
      actorRef: 'auth',
      action: 'LOGIN_FAILED',
      entityType: 'User',
      entityId: user.id,
      mallId: user.mallId,
      meta: { email },
    })
    return fail('Invalid email or password', 401)
  }

  clearLoginFails(failKey)

  const token = newSessionToken()
  await db.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId: user.id,
      expiresAt: sessionExpiry(),
      userAgent: request.headers.get('user-agent')?.slice(0, 180) ?? null,
    },
  })

  await audit({
    actorRole: user.role,
    actorRef: user.email ?? user.id,
    action: 'LOGIN',
    entityType: 'User',
    entityId: user.id,
  })

  const profile = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mallId: user.mallId,
    cinemaId: user.cinemaId,
    storeId: user.storeId,
    runnerId: user.runnerId,
  }

  const response = NextResponse.json({ ok: true, data: profile })
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions())
  return response
}
