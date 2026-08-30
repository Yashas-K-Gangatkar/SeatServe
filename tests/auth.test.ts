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
