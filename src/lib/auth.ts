// NotiFetch Phase 2 — authentication core (pure, unit-testable).
//
// Design decisions (CTO sign-off):
// - Passwords: scrypt (node:crypto, no deps) with per-user random salt,
//   verification via timingSafeEqual. Format: scrypt$N$r$p$saltHex$hashHex.
// - Sessions: opaque 32-byte random token in an httpOnly cookie; only
//   sha256(token) is stored server-side (a DB dump cannot be replayed).
// - Sessions live in the DB (revocable) with a 7-day sliding expiry window
//   created at login. Every staff API derives its tenant scope from the
//   session user's campusId/blockId/storeId — never from client input.

import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options?: { N?: number; r?: number; p?: number },
) => Promise<Buffer>

export const SESSION_TTL_MS = 7 * 24 * 3600_000
export const SESSION_COOKIE = 'ss_session'

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 }
const KEY_LEN = 64

// ─────────────────────────── passwords ───────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, KEY_LEN, SCRYPT_PARAMS)
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString('hex')}$${hash.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts
  const N = Number(nStr), r = Number(rStr), p = Number(pStr)
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false
  try {
    const expected = Buffer.from(hashHex, 'hex')
    const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, { N, r, p })
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

// ─────────────────────────── sessions ───────────────────────────

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function sessionExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + SESSION_TTL_MS)
}

// ─────────────────────────── RBAC & scope ───────────────────────────

export const STAFF_ROLES = ['CAMPUS_ADMIN', 'BLOCK_MANAGER', 'STORE_MANAGER', 'KITCHEN_STAFF', 'RUNNER'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]
export type Role = StaffRole | 'CUSTOMER'

// CAMPUS PIVOT bridge: rows created before the university pivot (and old audit
// history) carry the cinema-era role names. Normalize at the session boundary
// so both eras work during and after the data update.
const LEGACY_ROLE_MAP: Record<string, StaffRole> = {
  MALL_ADMIN: 'CAMPUS_ADMIN',
  CINEMA_MANAGER: 'BLOCK_MANAGER',
}

export function normalizeRole(role: string): Role {
  const legacy = LEGACY_ROLE_MAP[role]
  if (legacy) return legacy
  return (STAFF_ROLES as readonly string[]).includes(role) || role === 'CUSTOMER' ? (role as Role) : 'CUSTOMER'
}

export interface StaffUser {
  id: string
  name: string
  email: string | null
  role: Role
  campusId: string | null
  blockId: string | null
  storeId: string | null
  runnerId: string | null
}

export function isStaffRole(role: string): role is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(role)
}

/** Route-level allow-list check. Empty/null list = any authenticated staff. */
export function roleAllowed(role: string, allowed?: readonly string[]): boolean {
  if (!isStaffRole(role)) return false
  return !allowed || allowed.length === 0 || allowed.includes(role)
}

/**
 * Tenant scope guard: returns an error string when the user's role requires a
 * scope field that is missing (bad seed / tampered user), else null.
 * e.g. KITCHEN_STAFF & STORE_MANAGER must have storeId; BLOCK_MANAGER must
 * have blockId; CAMPUS_ADMIN must have campusId; RUNNER must have runnerId.
 */
export function scopeErrorFor(user: StaffUser): string | null {
  switch (user.role) {
    case 'KITCHEN_STAFF':
    case 'STORE_MANAGER':
      return user.storeId ? null : 'User has no store scope'
    case 'BLOCK_MANAGER':
      return user.blockId ? null : 'User has no block scope'
    case 'CAMPUS_ADMIN':
      return user.campusId ? null : 'User has no campus scope'
    case 'RUNNER':
      return user.runnerId ? null : 'User has no runner scope'
    default:
      return null
  }
}

// ─────────────── staff account management (Team panel) ───────────────

export type StaffMutationAction = 'SET_PASSWORD' | 'DEACTIVATE' | 'ACTIVATE' | 'REASSIGN' | 'DELETE'

export interface StaffMutationTarget {
  id: string
  role: Role
  campusId: string | null
  storeId: string | null
  blockId: string | null
}

/**
 * Who may mutate which staff account, and how? Pure RBAC matrix for the Team
 * panel — unit-tested in tests/auth.test.ts, consumed by /api/admin/staff/[id].
 *
 *   CAMPUS_ADMIN       — full control over every account in their campus (the route
 *                      re-checks campus membership) except self-mutation: changing
 *                      your own password/deactivating yourself needs a second
 *                      admin, by design, so one person can never be locked out
 *                      of everything by their own hand.
 *   BLOCK_MANAGER   — the owner's delegated campus operator: same powers as the
 *                      campus admin for store/block floor staff (create logins,
 *                      set passwords, reassign, disable), but CAMPUS_ADMIN
 *                      accounts themselves stay out of reach — the owner is
 *                      never managed by a delegate.
 *   STORE_MANAGER    — runs their shop's floor team: reset password / disable /
 *                      re-enable KITCHEN_STAFF of their OWN store. Never other
 *                      stores, never managers, never reassign/remove (campus-level
 *                      decisions stay with the campus admin).
 *   everyone else    — no staff management at all.
 *
 * Returns an error message for the denial, or null when allowed.
 */
export function staffMutationError(
  actor: StaffUser,
  target: StaffMutationTarget,
  action: StaffMutationAction,
): string | null {
  if (actor.id === target.id) {
    return action === 'SET_PASSWORD'
      ? 'Use a separate admin account to change your own password'
      : 'You cannot change your own account here'
  }
  if (actor.role === 'CAMPUS_ADMIN') {
    if (action === 'DELETE' && target.role === 'CAMPUS_ADMIN') return 'Campus admin accounts cannot be removed here'
    if (action === 'REASSIGN' && target.role === 'CAMPUS_ADMIN') return 'Campus admin accounts cannot be reassigned here'
    return null
  }
  if (actor.role === 'BLOCK_MANAGER') {
    // Delegated campus operator — manages the workforce, never the owner.
    if (target.role === 'CAMPUS_ADMIN') return 'Campus admin accounts can only be managed by another campus admin'
    return null
  }
  if (actor.role === 'STORE_MANAGER') {
    if (action === 'REASSIGN' || action === 'DELETE') return 'Only the campus admin can reassign or remove staff'
    if (target.role !== 'KITCHEN_STAFF') return 'Store managers can only manage kitchen staff accounts'
    if (target.storeId !== actor.storeId) return 'This kitchen staff account does not belong to your store'
    return null
  }
  return 'Your role cannot manage staff accounts'
}

/**
 * Can this staff user act on / read the given store?
 * KITCHEN_STAFF & STORE_MANAGER: only their own store.
 * CAMPUS_ADMIN & BLOCK_MANAGER: any store inside their campus. Others: never.
 */
export function canAccessStore(
  user: StaffUser,
  store: { id: string; campusId: string },
): boolean {
  switch (user.role) {
    case 'KITCHEN_STAFF':
    case 'STORE_MANAGER':
      return user.storeId === store.id
    case 'CAMPUS_ADMIN':
    case 'BLOCK_MANAGER':
      return user.campusId === store.campusId
    default:
      return false
  }
}
