// SeatServe — tests for the audit-fix round (showtime picker, refund math, room tokens)
import { describe, expect, test } from 'bun:test'
import { pickCurrentShow } from '../src/lib/showtime'
import { computeLegReversal, computeProportionalReversal } from '../src/lib/refunds'
import { signRoomToken, verifyRoomToken, isStaffRoom } from '../src/lib/realtime-auth'
import { cutoffInfo } from '../src/lib/cutoff'

const MIN = 60_000

describe('audit fix #20 — pickCurrentShow', () => {
  const now = new Date('2026-01-01T19:00:00Z')

  test('prefers the earliest show whose cutoff is still OPEN over a started show', () => {
    const startedClosed = { id: 'a', movieTitle: 'Old', startsAt: new Date(now.getTime() - 60 * MIN), orderCutoffMinutes: 30 }
    const laterOpen = { id: 'b', movieTitle: 'Next', startsAt: new Date(now.getTime() + 60 * MIN), orderCutoffMinutes: 30 }
    const picked = pickCurrentShow([startedClosed, laterOpen], now)
    expect(picked.show?.id).toBe('b')
    expect(picked.reason).toBe('ordering-open')
    expect(picked.info?.orderingOpen).toBe(true)
  })

  test('falls back to the blocked show (inside 3h window) when nothing is orderable', () => {
    const blocked = { id: 'x', movieTitle: 'Blocked', startsAt: new Date(now.getTime() + 20 * MIN), orderCutoffMinutes: 30 }
    const picked = pickCurrentShow([blocked], now)
    expect(picked.show?.id).toBe('x')
    expect(picked.reason).toBe('blocked-cutoff')
    expect(picked.info?.orderingOpen).toBe(false)
  })

  test('returns none when everything fell out of the 3h window', () => {
    const ancient = { id: 'z', movieTitle: 'Ancient', startsAt: new Date(now.getTime() - 300 * MIN), orderCutoffMinutes: 30 }
    expect(pickCurrentShow([ancient], now).show).toBeNull()
  })

  test('picks the LATER open show when the closer future show is already past its cutoff', () => {
    const soonButClosed = { id: 's', movieTitle: 'Soon', startsAt: new Date(now.getTime() + 10 * MIN), orderCutoffMinutes: 30 }
    const laterOpen = { id: 'l', movieTitle: 'Later', startsAt: new Date(now.getTime() + 120 * MIN), orderCutoffMinutes: 30 }
    const picked = pickCurrentShow([soonButClosed, laterOpen], now)
    expect(picked.show?.id).toBe('l')
  })
})

describe('audit fix #22 — cutoff display rounding', () => {
  test('ceils remaining cutoff minutes (never shows 0m while still open)', () => {
    const startsAt = new Date('2026-01-01T19:00:30Z')
    const now = new Date('2026-01-01T18:30:10Z') // 20s short of a full minute
    const info = cutoffInfo(startsAt, 30, now)
    expect(info.orderingOpen).toBe(true)
    expect(info.minutesUntilCutoff).toBe(1)
  })
})

describe('audit fix #5 — leg reversal math', () => {
  test('refund = legSubtotal + platformShare (no delivery fee, no tax) and rows sum to it', () => {
    const reversal = computeLegReversal({
      orderSubtotalPaise: 40000,
      orderPlatformFeePaise: 1200,
      legSubtotalPaise: 25000,
      storeCommissionPct: 14,
      storeId: 'store1',
    })
    const sum = reversal.rows.reduce((s, r) => s + r.amountPaise, 0)
    expect(sum).toBe(-reversal.refundTotalPaise)
    expect(reversal.refundTotalPaise).toBe(25000 + Math.round((1200 * 25000) / 40000))
    const storeRow = reversal.rows.find((r) => r.beneficiary === 'STORE')!
    const commission = Math.round((25000 * 14) / 100)
    expect(storeRow.amountPaise).toBe(-(25000 - commission))
  })

  test('all reversal rows are negative or zero', () => {
    const reversal = computeLegReversal({
      orderSubtotalPaise: 10000,
      orderPlatformFeePaise: 500,
      legSubtotalPaise: 10000,
      storeCommissionPct: 10,
      storeId: 's',
    })
    for (const row of reversal.rows) expect(row.amountPaise).toBeLessThanOrEqual(0)
  })
})

describe('audit fix #2 — proportional refund reversal', () => {
  const ledger = [
    { id: '1', storeId: 's1', beneficiary: 'STORE' as const, amountPaise: 12000 },
    { id: '2', storeId: 's2', beneficiary: 'STORE' as const, amountPaise: 8000 },
    { id: '4', storeId: null, beneficiary: 'PLATFORM_COMMISSION' as const, amountPaise: 2440 },
  ] // Σ = 22440

  test('adjustments are negative and sum exactly to the refund amount', () => {
    const amount = 10000
    const rows = computeProportionalReversal(ledger, amount)
    expect(rows.every((r) => r.amountPaise <= 0)).toBe(true)
    expect(rows.reduce((s, r) => s + r.amountPaise, 0)).toBe(-amount)
  })

  test('clamps to the ledger total and stays exact at awkward paise', () => {
    const rows = computeProportionalReversal(ledger, 99999)
    expect(rows.reduce((s, r) => s + r.amountPaise, 0)).toBe(-22440)
    const odd = computeProportionalReversal(ledger, 7)
    expect(odd.reduce((s, r) => s + r.amountPaise, 0)).toBe(-7)
  })
})

describe('audit fix #18 — realtime room tokens', () => {
  const SECRET = 'test_room_secret'

  test('valid token verifies for its room and role scope', () => {
    const token = signRoomToken({ r: 'admin:mall1', exp: Math.floor(Date.now() / 1000) + 60 }, SECRET)
    const payload = verifyRoomToken(token, SECRET, 'admin:mall1')
    expect(payload).not.toBeNull()
    expect(payload?.r).toBe('admin:mall1')
  })

  test('rejects: wrong room, tampered body, wrong secret, expired', () => {
    const token = signRoomToken({ r: 'admin:mall1', exp: Math.floor(Date.now() / 1000) + 60 }, SECRET)
    expect(verifyRoomToken(token, SECRET, 'admin:mall2')).toBeNull()
    expect(verifyRoomToken(token, 'other-secret', 'admin:mall1')).toBeNull()
    const expired = signRoomToken({ r: 'admin:mall1', exp: Math.floor(Date.now() / 1000) - 10 }, SECRET)
    expect(verifyRoomToken(expired, SECRET, 'admin:mall1')).toBeNull()
    const [body] = token.split('.')
    const evil = signRoomToken({ r: 'admin:mall2', exp: Math.floor(Date.now() / 1000) + 60 }, SECRET)
    const forged = `${body}.${evil.split('.')[1]}`
    expect(verifyRoomToken(forged, SECRET, 'admin:mall1')).toBeNull()
  })

  test('staff rooms are classified correctly (order rooms public)', () => {
    expect(isStaffRoom('admin:m1')).toBe(true)
    expect(isStaffRoom('runners:m1')).toBe(true)
    expect(isStaffRoom('store:abc')).toBe(true)
    expect(isStaffRoom('order:SS-ABC123')).toBe(false)
  })
})
