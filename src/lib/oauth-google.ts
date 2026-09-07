// Google OAuth sign-in helpers for the staff portal.
// Security posture:
//   - Authorization requests carry a random `state`; its SHA-256 hash lives in a
//     short-lived httpOnly cookie (`ss_oauth`), so a callback can be matched to
//     its initiating browser without exposing the raw value (CSRF protection).
//   - Only `openid email profile` scopes — nothing sensitive, so no Google
//     verification saga; consent screen can be published unverified.
//   - Identity is resolved server-side from Google's userinfo endpoint
//     (access-token gated) — the id_token is never trusted unverified.
//   - Account linking is by EXACT lowercased email match against an ACTIVE
//     staff User row. A Google account that is not pre-registered by a manager
//     can never sign in — no self-registration path exists here.
import { createHash, randomBytes } from 'node:crypto'

export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
export const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo'

export const OAUTH_STATE_COOKIE = 'ss_oauth'
export const OAUTH_ERROR_COOKIE = 'ss_oauth_err'

export const STAFF_ROLES = ['CAMPUS_ADMIN', 'BLOCK_MANAGER', 'STORE_MANAGER', 'KITCHEN_STAFF', 'RUNNER'] as const

export type GoogleProfile = { email: string; name: string | null; emailVerified: boolean }

/** Full redirect URI for the OAuth client. Env override wins so the flow always
 *  lands on the one URI registered in Google Cloud, regardless of which alias
 *  (notifetch.in / vercel.app preview) initiated it. */
export function redirectUri(requestOrigin: string): string {
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim()
  if (configured) return configured
  return `${requestOrigin}/api/auth/google/callback`
}

/** True only when both Google credentials are present — the login button and
 *  the /api/auth/google route key off this, so a half-configured env can never
 *  produce a broken sign-in button. */
export function googleEnabled(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim())
}

export function newStateToken(): string {
  return randomBytes(24).toString('base64url')
}

/** Constant-time-ish comparison of state: compare SHA-256 digests so token
 *  length differences can't leak through early-exit equality. */
export function stateMatches(rawFromCookie: string | undefined, rawFromQuery: string | null | undefined): boolean {
  if (!rawFromCookie || !rawFromQuery) return false
  const a = createHash('sha256').update(rawFromCookie).digest()
  const b = createHash('sha256').update(rawFromQuery).digest()
  return a.equals(b)
}

export function buildAuthorizeUrl(clientId: string, uri: string, state: string): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', uri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', state)
  // Staff may be signed into several Google accounts on a shared canteen
  // tablet — always let them pick explicitly.
  url.searchParams.set('prompt', 'select_account')
  return url.toString()
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const email = raw?.trim().toLowerCase()
  return email && email.includes('@') ? email : null
}

export type CodeExchange =
  | { ok: true; accessToken: string }
  | { ok: false; reason: 'exchange_failed' }

/** Exchange the authorization code for an access token. `fetcher` is injectable
 *  for tests. Never logs tokens — only boolean outcomes leave this module. */
export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  uri: string,
  fetcher: typeof fetch = fetch,
): Promise<CodeExchange> {
  try {
    const res = await fetcher(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: uri,
        grant_type: 'authorization_code',
      }),
    })
    if (!res.ok) return { ok: false, reason: 'exchange_failed' }
    const json = (await res.json()) as { access_token?: string }
    return json.access_token ? { ok: true, accessToken: json.access_token } : { ok: false, reason: 'exchange_failed' }
  } catch {
    return { ok: false, reason: 'exchange_failed' }
  }
}

export type ProfileFetch =
  | { ok: true; profile: GoogleProfile }
  | { ok: false; reason: 'profile_failed' | 'email_unverified' | 'email_missing' }

export async function fetchGoogleProfile(
  accessToken: string,
  fetcher: typeof fetch = fetch,
): Promise<ProfileFetch> {
  try {
    const res = await fetcher(GOOGLE_USERINFO_ENDPOINT, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return { ok: false, reason: 'profile_failed' }
    const json = (await res.json()) as { email?: string; email_verified?: boolean; name?: string }
    const email = normalizeEmail(json.email)
    if (!email) return { ok: false, reason: 'email_missing' }
    if (json.email_verified !== true) return { ok: false, reason: 'email_unverified' }
    return { ok: true, profile: { email, name: json.name?.trim() || null, emailVerified: true } }
  } catch {
    return { ok: false, reason: 'profile_failed' }
  }
}

/** Short, non-enumerable failure slugs carried to the login screen via redirect;
 *  StaffLogin maps them to human copy. */
export type GoogleSignInError =
  | 'no_account'
  | 'deactivated'
  | 'not_staff'
  | 'state_mismatch'
  | 'exchange_failed'
  | 'profile_failed'
  | 'email_unverified'
  | 'email_missing'
  | 'not_configured'

export function signInErrorSlug(reason: string): GoogleSignInError {
  switch (reason) {
    case 'no_account':
    case 'deactivated':
    case 'not_staff':
    case 'state_mismatch':
    case 'exchange_failed':
    case 'profile_failed':
    case 'email_unverified':
    case 'email_missing':
    case 'not_configured':
      return reason
    default:
      return 'profile_failed'
  }
}
