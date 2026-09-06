// GET /api/auth/providers — which sign-in methods are configured.
// Public (no secrets returned — booleans only). The login screen uses it to
// decide whether the "Sign in with Google" button exists.
import { NextResponse } from 'next/server'
import { googleEnabled } from '@/lib/oauth-google'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ ok: true, data: { google: googleEnabled() } })
}
