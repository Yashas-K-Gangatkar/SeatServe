// SeatServe Phase 2 — auth core unit tests: scrypt passwords, session token
// hashing, RBAC allow-lists and tenant-scope guards.
import { describe, test, expect } from 'bun:test'
import {
  hashPassword,
  verifyPassword,
  newSessionToken,
  hashSessionToken,
  sessionExpiry,
  isStaffRole,
  roleAllowed,
  scopeErrorFor,
  canAccessStore,
  staffMutationError,
  type StaffUser,
} from '../src/lib/auth'

const mkUser = (over: Partial<StaffUser> = {}): StaffUser => ({
  id: 'u1',
  name: 'Test Kitchen',
  email: 'kitchen@test.demo',
  role: 'KITCHEN_STAFF',
  mallId: null,
  cinemaId: null,
  storeId: 'store_snacks',
  runnerId: null,
  ...over,
})

describe('password hashing (scrypt)', () => {
  test('hash + verify round-trips', async () => {
    const hash = await hashPassword('demo1234')
    expect(hash.startsWith('scrypt$')).toBe(true)
    expect(await verifyPassword('demo1234', hash)).toBe(true)
  })

  test('wrong password fails', async () => {
    const hash = await hashPassword('demo1234')
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  test('salts are unique — same password, different hashes', async () => {
    const a = await hashPassword('same-password')
    const b = await hashPassword('same-password')
    expect(a).not.toBe(b)
    expect(await verifyPassword('same-password', a)).toBe(true)
    expect(await verifyPassword('same-password', b)).toBe(true)
  })

  test('tampered/garbage stored hash fails safely', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false)
    expect(await verifyPassword('x', 'scrypt$NaN$8$1$zz$zz')).toBe(false)
    expect(await verifyPassword('x', '')).toBe(false)
  })
})

describe('session tokens', () => {
  test('tokens are random and url-safe', () => {
    const a = newSessionToken()
    const b = newSessionToken()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(a.length).toBeGreaterThanOrEqual(40)
  })

  test('hash is deterministic sha256 hex — cookie token never stored raw', () => {
    const token = 'abc'
    expect(hashSessionToken(token)).toBe(hashSessionToken(token))
    expect(hashSessionToken(token)).toMatch(/^[a-f0-9]{64}$/)
    expect(hashSessionToken(token)).not.toContain(token)
  })

  test('expiry is ~7 days out', () => {
    const now = new Date('2026-08-31T10:00:00Z')
    const exp = sessionExpiry(now)
    expect(exp.getTime() - now.getTime()).toBe(7 * 24 * 3600_000)
  })
})

describe('RBAC allow-lists', () => {
  test('staff roles recognized', () => {
    for (const r of ['MALL_ADMIN', 'CINEMA_MANAGER', 'STORE_MANAGER', 'KITCHEN_STAFF', 'RUNNER']) {
      expect(isStaffRole(r)).toBe(true)
    }
    expect(isStaffRole('CUSTOMER')).toBe(false)
    expect(isStaffRole('SUPERUSER')).toBe(false)
  })

  test('empty allow-list = any staff; customer never passes', () => {
    expect(roleAllowed('KITCHEN_STAFF', [])).toBe(true)
    expect(roleAllowed('CUSTOMER', [])).toBe(false)
    expect(roleAllowed('MALL_ADMIN', ['MALL_ADMIN', 'CINEMA_MANAGER'])).toBe(true)
    expect(roleAllowed('KITCHEN_STAFF', ['MALL_ADMIN', 'CINEMA_MANAGER'])).toBe(false)
  })
})

describe('tenant scope guards', () => {
  test('kitchen/store manager need storeId', () => {
    expect(scopeErrorFor(mkUser())).toBeNull()
    expect(scopeErrorFor(mkUser({ storeId: null }))).toMatch(/no store scope/)
    expect(scopeErrorFor(mkUser({ role: 'STORE_MANAGER' }))).toBeNull()
    expect(scopeErrorFor(mkUser({ role: 'STORE_MANAGER', storeId: null }))).toMatch(/no store scope/)
  })

  test('cinema manager needs cinemaId; mall admin needs mallId; runner needs runnerId', () => {
    expect(scopeErrorFor(mkUser({ role: 'CINEMA_MANAGER', cinemaId: 'c1' }))).toBeNull()
    expect(scopeErrorFor(mkUser({ role: 'CINEMA_MANAGER', cinemaId: null }))).toMatch(/no cinema scope/)
    expect(scopeErrorFor(mkUser({ role: 'MALL_ADMIN', mallId: 'm1', storeId: null }))).toBeNull()
    expect(scopeErrorFor(mkUser({ role: 'MALL_ADMIN', mallId: null }))).toMatch(/no mall scope/)
    expect(scopeErrorFor(mkUser({ role: 'RUNNER', runnerId: 'r1', storeId: null }))).toBeNull()
    expect(scopeErrorFor(mkUser({ role: 'RUNNER', runnerId: null }))).toMatch(/no runner scope/)
  })

  test('canAccessStore: cook pinned to own store only', () => {
    const cook = mkUser()
    expect(canAccessStore(cook, { id: 'store_snacks', mallId: 'mall1' })).toBe(true)
    expect(canAccessStore(cook, { id: 'store_pizza', mallId: 'mall1' })).toBe(false)
  })

  test('canAccessStore: mall admin covers whole mall, not other malls', () => {
    const admin = mkUser({ role: 'MALL_ADMIN', storeId: null, mallId: 'mall1' })
    expect(canAccessStore(admin, { id: 'store_snacks', mallId: 'mall1' })).toBe(true)
    expect(canAccessStore(admin, { id: 'store_elsewhere', mallId: 'mall2' })).toBe(false)
  })

  test('canAccessStore: cinema manager and runner never pass store checks', () => {
    const cm = mkUser({ role: 'CINEMA_MANAGER', storeId: null, cinemaId: 'c1' })
    const runner = mkUser({ role: 'RUNNER', storeId: null, runnerId: 'r1' })
    expect(canAccessStore(cm, { id: 'store_snacks', mallId: 'mall1' })).toBe(false)
    expect(canAccessStore(runner, { id: 'store_snacks', mallId: 'mall1' })).toBe(false)
  })
})

// ───────── staff management RBAC matrix (Team panel) ─────────

describe('staffMutationError matrix', () => {
  const admin = mkUser({ id: 'admin', role: 'MALL_ADMIN', mallId: 'mall_1', storeId: null })
  const managerA = mkUser({ id: 'mgrA', role: 'STORE_MANAGER', mallId: null, storeId: 'store_A' })
  const managerB = mkUser({ id: 'mgrB', role: 'STORE_MANAGER', mallId: null, storeId: 'store_B' })
  const chefA = mkUser({ id: 'chefA', role: 'KITCHEN_STAFF', mallId: null, storeId: 'store_A' })
  const chefB = mkUser({ id: 'chefB', role: 'KITCHEN_STAFF', mallId: null, storeId: 'store_B' })
  const target = (u: StaffUser) => ({ id: u.id, role: u.role, mallId: u.mallId, storeId: u.storeId, cinemaId: u.cinemaId })

  test('mall admin controls every non-self account in every way', () => {
    for (const action of ['SET_PASSWORD', 'DEACTIVATE', 'ACTIVATE', 'REASSIGN', 'DELETE'] as const) {
      expect(staffMutationError(admin, target(chefA), action)).toBeNull()
      expect(staffMutationError(admin, target(managerA), action)).toBeNull()
    }
  })

  test('mall admin can never mutate their own account (single-admin lockout guard)', () => {
    expect(staffMutationError(admin, target(admin), 'SET_PASSWORD')).toMatch(/separate admin/)
    expect(staffMutationError(admin, target(admin), 'DEACTIVATE')).toMatch(/own account/)
    expect(staffMutationError(admin, target(admin), 'REASSIGN')).toMatch(/own account/)
  })

  test('mall admin accounts cannot be deleted or reassigned by anyone', () => {
    const admin2 = mkUser({ id: 'admin2', role: 'MALL_ADMIN', mallId: 'mall_1' })
    expect(staffMutationError(admin, target(admin2), 'DELETE')).toMatch(/cannot be removed/)
    expect(staffMutationError(admin, target(admin2), 'REASSIGN')).toMatch(/cannot be reassigned/)
  })

  test('store manager manages ONLY kitchen staff of their own store', () => {
    expect(staffMutationError(managerA, target(chefA), 'SET_PASSWORD')).toBeNull()
    expect(staffMutationError(managerA, target(chefA), 'DEACTIVATE')).toBeNull()
    expect(staffMutationError(managerA, target(chefA), 'ACTIVATE')).toBeNull()
  })

  test('store manager cannot reach across stores', () => {
    expect(staffMutationError(managerA, target(chefB), 'SET_PASSWORD')).toMatch(/does not belong to your store/)
    expect(staffMutationError(managerA, target(chefB), 'DEACTIVATE')).toMatch(/does not belong to your store/)
  })

  test('store manager cannot manage managers, reassign, or delete', () => {
    expect(staffMutationError(managerA, target(managerB), 'SET_PASSWORD')).toMatch(/only manage kitchen staff/)
    expect(staffMutationError(managerA, target(managerB), 'DEACTIVATE')).toMatch(/only manage kitchen staff/)
    expect(staffMutationError(managerA, target(chefA), 'REASSIGN')).toMatch(/only the mall admin/i)
    expect(staffMutationError(managerA, target(chefA), 'DELETE')).toMatch(/only the mall admin/i)
  })

  test('kitchen staff can manage nobody', () => {
    expect(staffMutationError(chefA, target(chefB), 'SET_PASSWORD')).toMatch(/cannot manage staff/)
  })
})
