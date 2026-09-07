// Unit tests for the Google staff sign-in helpers (no network — fetch mocked).
import { afterEach, describe, expect, test } from 'bun:test'
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchGoogleProfile,
  googleEnabled,
  newStateToken,
  normalizeEmail,
  redirectUri,
  stateMatches,
} from '../src/lib/oauth-google'

const ENV_KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'] as const
const savedEnv: Record<string, string | undefined> = {}
for (const key of ENV_KEYS) savedEnv[key] = process.env[key]

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
})

describe('googleEnabled', () => {
  test('false when credentials missing', () => {
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
    expect(googleEnabled()).toBe(false)
  })
  test('true only when BOTH credentials present', () => {
    process.env.GOOGLE_CLIENT_ID = 'id'
    delete process.env.GOOGLE_CLIENT_SECRET
    expect(googleEnabled()).toBe(false)
    process.env.GOOGLE_CLIENT_SECRET = 'secret'
    expect(googleEnabled()).toBe(true)
  })
})

describe('redirectUri', () => {
  test('env override wins over request origin', () => {
    process.env.GOOGLE_REDIRECT_URI = 'https://notifetch.in/api/auth/google/callback'
    expect(redirectUri('https://elsewhere.example')).toBe('https://notifetch.in/api/auth/google/callback')
  })
  test('derives from origin when no override', () => {
    delete process.env.GOOGLE_REDIRECT_URI
    expect(redirectUri('https://notifetch.in')).toBe('https://notifetch.in/api/auth/google/callback')
  })
})

describe('state', () => {
  test('tokens are unique and stateMatches validates pairs', () => {
    const a = newStateToken()
    const b = newStateToken()
    expect(a).not.toBe(b)
    expect(stateMatches(a, a)).toBe(true)
    expect(stateMatches(a, b)).toBe(false)
    expect(stateMatches(undefined, a)).toBe(false)
    expect(stateMatches(a, null)).toBe(false)
    expect(stateMatches('', '')).toBe(false)
  })
})

describe('buildAuthorizeUrl', () => {
  test('carries client, redirect, scope, state, select_account prompt', () => {
    const url = new URL(buildAuthorizeUrl('cid-123', 'https://notifetch.in/api/auth/google/callback', 'st-1'))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('client_id')).toBe('cid-123')
    expect(url.searchParams.get('redirect_uri')).toBe('https://notifetch.in/api/auth/google/callback')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('openid email profile')
    expect(url.searchParams.get('state')).toBe('st-1')
    expect(url.searchParams.get('prompt')).toBe('select_account')
  })
})

describe('normalizeEmail', () => {
  test('trims + lowercases; rejects junk', () => {
    expect(normalizeEmail('  Canteen.Guy@Gmail.COM ')).toBe('canteen.guy@gmail.com')
    expect(normalizeEmail('not-an-email')).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
    expect(normalizeEmail(undefined)).toBeNull()
  })
})

describe('exchangeCodeForToken', () => {
  const args = ['code-1', 'cid', 'csecret', 'https://notifetch.in/api/auth/google/callback'] as const

  test('returns access token on success', async () => {
    const fetcher = (async () =>
      new Response(JSON.stringify({ access_token: 'tok-9' }), { status: 200 })) as unknown as typeof fetch
    expect(await exchangeCodeForToken(...args, fetcher)).toEqual({ ok: true, accessToken: 'tok-9' })
  })
  test('non-200 → exchange_failed (no token leak)', async () => {
    const fetcher = (async () => new Response('{"error":"bad_code"}', { status: 400 })) as unknown as typeof fetch
    const result = await exchangeCodeForToken(...args, fetcher)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('exchange_failed')
  })
  test('network throw → exchange_failed', async () => {
    const fetcher = (async () => {
      throw new Error('boom')
    }) as unknown as typeof fetch
    const result = await exchangeCodeForToken(...args, fetcher)
    expect(result.ok).toBe(false)
  })
})

describe('fetchGoogleProfile', () => {
  test('verified email → ok profile (lowercased)', async () => {
    const fetcher = (async () =>
      new Response(JSON.stringify({ email: 'Chef@Gmail.com', email_verified: true, name: ' Chef ' }), {
        status: 200,
      })) as unknown as typeof fetch
    const result = await fetchGoogleProfile('tok', fetcher)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.profile.email).toBe('chef@gmail.com')
      expect(result.profile.name).toBe('Chef')
    }
  })
  test('unverified email rejected', async () => {
    const fetcher = (async () =>
      new Response(JSON.stringify({ email: 'a@b.com', email_verified: false }), { status: 200 })) as unknown as typeof fetch
    const result = await fetchGoogleProfile('tok', fetcher)
    expect(result).toEqual({ ok: false, reason: 'email_unverified' })
  })
  test('missing email rejected', async () => {
    const fetcher = (async () => new Response(JSON.stringify({ sub: 'x', email_verified: true }), { status: 200 })) as unknown as typeof fetch
    expect(await fetchGoogleProfile('tok', fetcher)).toEqual({ ok: false, reason: 'email_missing' })
  })
  test('userinfo failure → profile_failed', async () => {
    const fetcher = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch
    expect(await fetchGoogleProfile('tok', fetcher)).toEqual({ ok: false, reason: 'profile_failed' })
  })
})
