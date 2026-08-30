// POST /api/auth/logout — revoke the current session (delete row + clear cookie).
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok } from '@/lib/api-helpers'
import { SESSION_COOKIE, hashSessionToken } from '@/lib/auth'
import { sessionCookieOptions, tokenFromRequest } from '@/lib/auth-server'

export async function POST(request: Request) {
  const token = tokenFromRequest(request)
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } })
  }
  const response = NextResponse.json({ ok: true, data: { signedOut: true } })
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 })
  return response
}
