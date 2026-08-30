// POST /api/auth/login — staff portal sign-in (email + password).
// Sets an httpOnly session cookie; response contains the scoped profile only.
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { SESSION_COOKIE, hashSessionToken, newSessionToken, sessionExpiry, verifyPassword } from '@/lib/auth'
import { sessionCookieOptions } from '@/lib/auth-server'
import { audit } from '@/lib/audit'

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

export async function POST(request: Request) {
  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error
  const { email, password } = parsed.data

  const user = await db.user.findUnique({ where: { email } })
  if (!user || !user.passwordHash) return fail('Invalid email or password', 401)
  if (!user.isActive) return fail('This account is deactivated — contact your mall admin', 403)
  if (!['MALL_ADMIN', 'CINEMA_MANAGER', 'STORE_MANAGER', 'KITCHEN_STAFF', 'RUNNER'].includes(user.role)) {
    return fail('This account is not a staff account', 403)
  }

  const passwordOk = await verifyPassword(password, user.passwordHash)
  if (!passwordOk) {
    await audit({
      actorRole: 'SYSTEM',
      actorRef: 'auth',
      action: 'LOGIN_FAILED',
      entityType: 'User',
      entityId: user.id,
      meta: { email },
    })
    return fail('Invalid email or password', 401)
  }

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
