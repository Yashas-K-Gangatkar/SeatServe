// SeatServe — pricing & split-ledger invariants
import { describe, test, expect } from 'bun:test'
import { taxComponentPaise, priceLine, computeBill, computeSplits, platformFeePaise, rupees, DEFAULT_PLATFORM } from '../src/lib/pricing'

const fees = (commissionPct: number, deliveryFeePaise: number, prepBufferMin = 8) => ({ commissionPct, deliveryFeePaise, prepBufferMin })

describe('taxComponentPaise (GST extracted from inclusive price)', () => {
  test('5% GST on ₹180 → ₹8.57 = 857 paise', () => {
    expect(taxComponentPaise(18000, 5)).toBe(857)
  })
  test('zero tax', () => {
    expect(taxComponentPaise(10000, 0)).toBe(0)
  })
  test('rejects negative/float amounts', () => {
    expect(() => taxComponentPaise(-1, 5)).toThrow()
    expect(() => taxComponentPaise(1.5, 5)).toThrow()
  })
  test('rejects rate outside 0..100', () => {
    expect(() => taxComponentPaise(100, 120)).toThrow()
  })
})

describe('priceLine', () => {
  test('line total and tax', () => {
    const line = priceLine({ unitPricePaise: 25000, qty: 2, taxRatePct: 5 })
    expect(line.lineTotalPaise).toBe(50000)
    expect(line.taxPaise).toBe(2381)
  })
  test('rejects qty 0 and floats', () => {
    expect(() => priceLine({ unitPricePaise: 100, qty: 0, taxRatePct: 5 })).toThrow()
    expect(() => priceLine({ unitPricePaise: 100, qty: 1.5, taxRatePct: 5 })).toThrow()
  })
})

describe('computeBill + computeSplits — the ledger invariant', () => {
  test('single store: splits sum exactly to total', () => {
    const bill = computeBill([
      {
        storeId: 's1',
        prepMinutes: [5, 4],
        fees: fees(12, 1900),
        lines: [
          { unitPricePaise: 18000, qty: 1, taxRatePct: 5 },
          { unitPricePaise: 14000, qty: 2, taxRatePct: 5 },
        ],
      },
    ])
    const splits = computeSplits(bill)
    const sum = splits.reduce((s, r) => s + r.amountPaise, 0)
    expect(sum).toBe(bill.totalPaise)
  })

  test('multi-store: splits sum exactly to total, store nets are consistent', () => {
    const bill = computeBill([
      { storeId: 's1', prepMinutes: [5], fees: fees(12, 1900), lines: [{ unitPricePaise: 18000, qty: 1, taxRatePct: 5 }] },
      { storeId: 's2', prepMinutes: [14], fees: fees(14, 2900), lines: [{ unitPricePaise: 25000, qty: 2, taxRatePct: 5 }] },
      { storeId: 's3', prepMinutes: [3], fees: fees(10, 1900), lines: [{ unitPricePaise: 8000, qty: 3, taxRatePct: 12 }] },
    ])
    const splits = computeSplits(bill)
    const sum = splits.reduce((s, r) => s + r.amountPaise, 0)
    expect(sum).toBe(bill.totalPaise)

    // store net = subtotal − tax − commission (individually)
    for (const ps of bill.perStore) {
      const commission = Math.round((ps.subtotalPaise * { s1: 12, s2: 14, s3: 10 }[ps.storeId]!) / 100)
      expect(ps.storeNetPaise).toBe(ps.subtotalPaise - ps.taxPaise - commission)
    }

    // total = subtotal + delivery + platform fee
    expect(bill.totalPaise).toBe(bill.subtotalPaise + bill.deliveryFeePaise + bill.platformFeePaise)
  })

  test('delivery fee accumulates per store', () => {
    const bill = computeBill([
      { storeId: 'a', prepMinutes: [5], fees: fees(12, 1900), lines: [{ unitPricePaise: 10000, qty: 1, taxRatePct: 5 }] },
      { storeId: 'b', prepMinutes: [5], fees: fees(12, 2900), lines: [{ unitPricePaise: 10000, qty: 1, taxRatePct: 5 }] },
    ])
    expect(bill.deliveryFeePaise).toBe(4800)
  })

  test('prep estimate uses slowest item + load + buffer + walk', () => {
    const bill = computeBill([
      { storeId: 'a', prepMinutes: [14, 4], fees: fees(12, 1900, 12), lines: [{ unitPricePaise: 10000, qty: 3, taxRatePct: 5 }, { unitPricePaise: 10000, qty: 1, taxRatePct: 5 }] },
    ])
    // slowest 14 + extra units 2*2 + buffer 12 + walk 6 = 36
    expect(bill.prepEstimateMinutes).toBe(36)
  })

  test('commission can never exceed store subtotal', () => {
    expect(() =>
      computeBill([{ storeId: 'a', prepMinutes: [5], fees: fees(100, 1900), lines: [{ unitPricePaise: 10000, qty: 1, taxRatePct: 5 }] }]),
    ).toThrow()
  })

  test('empty cart rejected', () => {
    expect(() => computeBill([])).toThrow()
  })
})

describe('platformFeePaise (configurable convenience fee)', () => {
  test('3% of subtotal, bounded by min and max', () => {
    expect(platformFeePaise(10000, DEFAULT_PLATFORM)).toBe(500) // 3% of ₹100 = ₹3 → min ₹5
    expect(platformFeePaise(1000000, DEFAULT_PLATFORM)).toBe(2500) // 3% of ₹10,000 = ₹300 → max ₹25
    expect(platformFeePaise(50000, DEFAULT_PLATFORM)).toBe(1500) // 3% of ₹500 = ₹15
  })
})

describe('rupees formatting', () => {
  test('whole and fractional rupees, Indian grouping', () => {
    expect(rupees(18000)).toBe('₹180')
    expect(rupees(75440)).toBe('₹754.40')
    expect(rupees(123456789)).toBe('₹12,34,567.89')
    expect(rupees(-100)).toBe('-₹1')
  })
})
