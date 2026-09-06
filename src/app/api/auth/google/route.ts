// GET /api/auth/google — begin Google staff sign-in.
// Sets a short-lived state cookie, then 302s to Google's consent screen.
// When Google credentials are absent the button is hidden anyway; this route
// still answers cleanly instead of erroring so stale UI can't crash.
import { NextResponse } from 'next/server'
import {
  OAUTH_STATE_COOKIE,
  buildAuthorizeUrl,
  googleEnabled,
  newStateToken,
  redirectUri,
} from '@/lib/oauth-google'
import { sessionCookieOptions } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

function loginReturn(request: Request, slug?: string): NextResponse {
  const origin = new URL(request.url).origin
  const url = new URL(`${origin}/#/staff/login`)
  if (slug) url.searchParams.set('gerr', slug)
  return NextResponse.redirect(url)
}

export async function GET(request: Request) {
  if (!googleEnabled()) return loginReturn(request, 'not_configured')

  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (!host) return loginReturn(request, 'profile_failed')
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  const origin = `${proto}://${host}`

  const state = newStateToken()
  const authorize = buildAuthorizeUrl(
    process.env.GOOGLE_CLIENT_ID!.trim(),
    redirectUri(origin),
    state,
  )

  const response = NextResponse.redirect(authorize)
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    ...sessionCookieOptions(),
    maxAge: 600, // 10 minutes to finish consent — then it's dead
  })
  return response
}
