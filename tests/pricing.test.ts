// SeatServe — pricing & split-ledger invariants
// Money model: NO delivery fee · NO platform-held GST · platform fee fixed at
// 5% of the TOTAL the customer pays (gross-up).
import { describe, test, expect } from 'bun:test'
import { priceLine, computeBill, computeSplits, platformFeePaise, rupees, PLATFORM_FEE_PCT } from '../src/lib/pricing'

const fees = (commissionPct: number, prepBufferMin = 8) => ({ commissionPct, prepBufferMin })

describe('priceLine', () => {
  test('line total is unit × qty', () => {
    const line = priceLine({ unitPricePaise: 25000, qty: 2, taxRatePct: 5 })
    expect(line.lineTotalPaise).toBe(50000)
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
        fees: fees(12),
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
      { storeId: 's1', prepMinutes: [5], fees: fees(12), lines: [{ unitPricePaise: 18000, qty: 1, taxRatePct: 5 }] },
      { storeId: 's2', prepMinutes: [14], fees: fees(14), lines: [{ unitPricePaise: 25000, qty: 2, taxRatePct: 5 }] },
      { storeId: 's3', prepMinutes: [3], fees: fees(10), lines: [{ unitPricePaise: 8000, qty: 3, taxRatePct: 12 }] },
    ])
    const splits = computeSplits(bill)
    const sum = splits.reduce((s, r) => s + r.amountPaise, 0)
    expect(sum).toBe(bill.totalPaise)

    // store net = subtotal − commission (no delivery fee, no platform-held tax)
    for (const ps of bill.perStore) {
      const commission = Math.round((ps.subtotalPaise * { s1: 12, s2: 14, s3: 10 }[ps.storeId]!) / 100)
      expect(ps.storeNetPaise).toBe(ps.subtotalPaise - commission)
    }

    // total = subtotal + platform fee
    expect(bill.totalPaise).toBe(bill.subtotalPaise + bill.platformFeePaise)

    // exactly one STORE row per store + one PLATFORM_COMMISSION row
    expect(splits.filter((r) => r.beneficiary === 'STORE')).toHaveLength(3)
    expect(splits.filter((r) => r.beneficiary === 'PLATFORM_COMMISSION')).toHaveLength(1)
  })

  test('no delivery fee exists anywhere in the bill', () => {
    const bill = computeBill([
      { storeId: 'a', prepMinutes: [5], fees: fees(12), lines: [{ unitPricePaise: 10000, qty: 1, taxRatePct: 5 }] },
      { storeId: 'b', prepMinutes: [5], fees: fees(12), lines: [{ unitPricePaise: 10000, qty: 1, taxRatePct: 5 }] },
    ])
    expect(bill.totalPaise).toBe(bill.subtotalPaise + bill.platformFeePaise)
  })

  test('prep estimate uses slowest item + load + buffer + walk', () => {
    const bill = computeBill([
      { storeId: 'a', prepMinutes: [14, 4], fees: fees(12, 12), lines: [{ unitPricePaise: 10000, qty: 3, taxRatePct: 5 }, { unitPricePaise: 10000, qty: 1, taxRatePct: 5 }] },
    ])
    // slowest 14 + extra units 2*2 + buffer 12 + walk 6 = 36
    expect(bill.prepEstimateMinutes).toBe(36)
  })

  test('commission can never exceed store subtotal', () => {
    expect(() =>
      computeBill([{ storeId: 'a', prepMinutes: [5], fees: fees(150), lines: [{ unitPricePaise: 10000, qty: 1, taxRatePct: 5 }] }]),
    ).toThrow()
  })

  test('empty cart rejected', () => {
    expect(() => computeBill([])).toThrow()
  })
})

describe('platformFeePaise — fixed 5% of the customer total', () => {
  test('fee is exactly 5% of the final total (gross-up), within one paisa', () => {
    expect(PLATFORM_FEE_PCT).toBe(5)
    const fee = platformFeePaise(10000) // ₹100 food
    const total = 10000 + fee
    expect(Math.abs(fee / total - 0.05)).toBeLessThanOrEqual(0.0005)
    // worked example: total = round(10000/0.95) = 10526, fee = 526
    expect(fee).toBe(526)
    expect(total).toBe(10526)
  })
  test('bigger cart stays proportional; zero subtotal → zero fee', () => {
    const fee = platformFeePaise(500000) // ₹5,000 food
    const total = 500000 + fee
    expect(total).toBe(Math.round(500000 / 0.95))
    expect(Math.abs(fee / total - 0.05)).toBeLessThanOrEqual(0.0005)
    expect(platformFeePaise(0)).toBe(0)
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
