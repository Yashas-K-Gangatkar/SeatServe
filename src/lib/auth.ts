// SeatServe Phase 2 — authentication core (pure, unit-testable).
//
// Design decisions (CTO sign-off):
// - Passwords: scrypt (node:crypto, no deps) with per-user random salt,
//   verification via timingSafeEqual. Format: scrypt$N$r$p$saltHex$hashHex.
// - Sessions: opaque 32-byte random token in an httpOnly cookie; only
//   sha256(token) is stored server-side (a DB dump cannot be replayed).
// - Sessions live in the DB (revocable) with a 7-day sliding expiry window
//   created at login. Every staff API derives its tenant scope from the
//   session user's mallId/cinemaId/storeId — never from client input.

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

export const STAFF_ROLES = ['MALL_ADMIN', 'CINEMA_MANAGER', 'STORE_MANAGER', 'KITCHEN_STAFF', 'RUNNER'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]
export type Role = StaffRole | 'CUSTOMER'

export interface StaffUser {
  id: string
  name: string
  email: string | null
  role: Role
  mallId: string | null
  cinemaId: string | null
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
 * e.g. KITCHEN_STAFF & STORE_MANAGER must have storeId; CINEMA_MANAGER must
 * have cinemaId; MALL_ADMIN must have mallId; RUNNER must have runnerId.
 */
export function scopeErrorFor(user: StaffUser): string | null {
  switch (user.role) {
    case 'KITCHEN_STAFF':
    case 'STORE_MANAGER':
      return user.storeId ? null : 'User has no store scope'
    case 'CINEMA_MANAGER':
      return user.cinemaId ? null : 'User has no cinema scope'
    case 'MALL_ADMIN':
      return user.mallId ? null : 'User has no mall scope'
    case 'RUNNER':
      return user.runnerId ? null : 'User has no runner scope'
    default:
      return null
  }
}

/**
 * Can this staff user act on / read the given store?
 * KITCHEN_STAFF & STORE_MANAGER: only their own store.
 * MALL_ADMIN: any store inside their mall. Others: never.
 */
export function canAccessStore(
  user: StaffUser,
  store: { id: string; mallId: string },
): boolean {
  switch (user.role) {
    case 'KITCHEN_STAFF':
    case 'STORE_MANAGER':
      return user.storeId === store.id
    case 'MALL_ADMIN':
      return user.mallId === store.mallId
    default:
      return false
  }
}
