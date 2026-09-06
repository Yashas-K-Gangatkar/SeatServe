// GET /api/auth/google/callback — finish Google staff sign-in.
// Flow: verify state cookie → exchange code → fetch verified email from
// Google → link to an EXISTING active staff User by exact email → issue the
// SAME session cookie the password login issues (one session system, one
// enforcement model). Unregistered Google accounts are bounced with a slug —
// nobody can conjure staff access by owning a Gmail address.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { SESSION_COOKIE, hashSessionToken, newSessionToken, sessionExpiry } from '@/lib/auth'
import { sessionCookieOptions } from '@/lib/auth-server'
import { audit } from '@/lib/audit'
import {
  OAUTH_STATE_COOKIE,
  STAFF_ROLES,
  exchangeCodeForToken,
  fetchGoogleProfile,
  googleEnabled,
  redirectUri,
  stateMatches,
} from '@/lib/oauth-google'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const origin = new URL(request.url).origin
  const loginWith = (slug: string, detail?: string) => {
    const url = new URL(`${origin}/#/staff/login`)
    url.searchParams.set('gerr', slug)
    const res = NextResponse.redirect(url)
    // state cookie is single-use regardless of outcome
    res.cookies.delete(OAUTH_STATE_COOKIE)
    if (detail) console.error(`[auth/google] ${slug}: ${detail}`)
    return res
  }

  if (!googleEnabled()) return loginWith('not_configured')

  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const state = requestUrl.searchParams.get('state')
  const cookieState = request.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${OAUTH_STATE_COOKIE}=`))
    ?.split('=')
    .slice(1)
    .join('=')

  if (!code || !stateMatches(cookieState, state)) return loginWith('state_mismatch')
  if (requestUrl.searchParams.get('error')) return loginWith('profile_failed', 'user denied consent')

  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? requestUrl.host
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  const exchange = await exchangeCodeForToken(
    code,
    process.env.GOOGLE_CLIENT_ID!.trim(),
    process.env.GOOGLE_CLIENT_SECRET!.trim(),
    redirectUri(`${proto}://${host}`),
  )
  if (!exchange.ok) return loginWith('exchange_failed')

  const profile = await fetchGoogleProfile(exchange.accessToken)
  if (!profile.ok) return loginWith(profile.reason)

  const user = await db.user.findUnique({ where: { email: profile.profile.email } })
  if (!user) {
    await audit({
      actorRole: 'SYSTEM',
      actorRef: 'auth/google',
      action: 'LOGIN_GOOGLE_REJECTED',
      entityType: 'User',
      entityId: profile.profile.email,
      meta: { reason: 'no_account' },
    })
    return loginWith('no_account')
  }
  if (!user.isActive) return loginWith('deactivated')
  if (!STAFF_ROLES.includes(user.role as (typeof STAFF_ROLES)[number])) {
    return loginWith('not_staff')
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
    action: 'LOGIN_GOOGLE',
    entityType: 'User',
    entityId: user.id,
  })

  const response = NextResponse.redirect(new URL(`${origin}/#/staff`))
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions())
  response.cookies.delete(OAUTH_STATE_COOKIE)
  return response
}
