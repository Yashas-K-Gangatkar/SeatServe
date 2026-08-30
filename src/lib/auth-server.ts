// SeatServe Phase 2 — server-only auth helpers for API route handlers.
// Every staff-facing route calls requireStaff() and derives its Prisma
// filters from the returned user's scope columns, NEVER from query params.
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { fail } from '@/lib/api-helpers'
import {
  SESSION_COOKIE,
  hashSessionToken,
  roleAllowed,
  scopeErrorFor,
  type Role,
  type StaffUser,
} from '@/lib/auth'

interface NextResponseLike {
  status: number
}

/** Read the session cookie from the request (works in route handlers). */
export function tokenFromRequest(request: Request): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='))
  }
  return null
}

/** Load the session user for a request, or null (no/invalid/expired session). */
export async function sessionUser(request: Request): Promise<StaffUser | null> {
  const token = tokenFromRequest(request)
  if (!token) return null
  const session = await db.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  })
  if (!session) return null
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined)
    return null
  }
  const u = session.user
  if (!u.isActive) return null
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as Role,
    mallId: u.mallId,
    cinemaId: u.cinemaId,
    storeId: u.storeId,
    runnerId: u.runnerId,
  }
}

export type AuthResult = { user: StaffUser } | { error: NextResponseLike & { json: unknown } }

/**
 * Route guard: 401 when not signed in / role not allowed; 403 when the
 * account lacks its tenant scope. Usage:
 *   const auth = await requireStaff(request, ['KITCHEN_STAFF', 'STORE_MANAGER'])
 *   if ('error' in auth) return auth.error as unknown as NextResponse
 *   const user = auth.user
 */
export async function requireStaff(
  request: Request,
  allowedRoles?: readonly string[],
): Promise<{ user: StaffUser } | { error: ReturnType<typeof fail> }> {
  const user = await sessionUser(request)
  if (!user) return { error: fail('Authentication required — sign in at the staff portal', 401) }
  if (!roleAllowed(user.role, allowedRoles)) {
    return { error: fail(`Your role (${user.role}) cannot access this resource`, 403) }
  }
  const scopeErr = scopeErrorFor(user)
  if (scopeErr) return { error: fail(`Account misconfigured: ${scopeErr}`, 403) }
  return { user }
}

/** Session cookie options (httpOnly, sameSite=lax; secure when behind HTTPS). */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 24 * 3600,
  }
}
