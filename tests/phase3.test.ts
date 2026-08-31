// SeatServe Phase 3 — provider signatures, ledger-driven settlement math,
// refund adjustment exactness. All pure (no DB).
import { describe, test, expect } from 'bun:test'
import {
  razorpaySignature,
  razorpayVerify,
  cashfreeSignature,
  cashfreeVerify,
  razorpayTransfers,
  cashfreeSplits,
  linkedAccountFor,
  vendorIdFor,
} from '@/lib/payments/provider'
import { computeBill, computeSplits, type StoreLineGroup } from '@/lib/pricing'
import { computeLegReversal } from '@/lib/leg-voids'

const SECRET = 'test_secret'

// ───────── Razorpay Route signature scheme ─────────

describe('Razorpay webhook scheme', () => {
  test('hex HMAC-SHA256 of the raw body verifies; tampering fails', () => {
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_abc' } } } })
    const sig = razorpaySignature(SECRET, body)
    expect(sig).toMatch(/^[0-9a-f]{64}$/)
    expect(razorpayVerify(SECRET, body, sig)).toBe(true)
    expect(razorpayVerify(SECRET, body + ' ', sig)).toBe(false)
    expect(razorpayVerify(SECRET, body, sig.slice(0, -2) + '00')).toBe(false)
    expect(razorpayVerify('other_secret', body, sig)).toBe(false)
  })

  test('signature is deterministic and body-bound', () => {
    expect(razorpaySignature(SECRET, 'x')).toBe(razorpaySignature(SECRET, 'x'))
    expect(razorpaySignature(SECRET, 'x')).not.toBe(razorpaySignature(SECRET, 'y'))
  })
})

// ───────── Cashfree Easy Split signature scheme ─────────

describe('Cashfree webhook scheme', () => {
  test('base64 HMAC of timestamp+body verifies; timestamp is binding', () => {
    const body = JSON.stringify({ type: 'PAYMENT_SUCCESS', data: { order: { order_id: 'SS-1|ref' }, payment: { cf_payment_id: 42 } } })
    const ts = '1725000000000'
    const sig = cashfreeSignature(SECRET, ts, body)
    expect(sig.length).toBeGreaterThan(20)
    expect(cashfreeVerify(SECRET, ts, body, sig)).toBe(true)
    // replayed with a different timestamp → rejected
    expect(cashfreeVerify(SECRET, ts + '1', body, sig)).toBe(false)
    expect(cashfreeVerify(SECRET, ts, body + 'x', sig)).toBe(false)
  })
})

// ───────── Split instruction builders (Route / Easy Split shapes) ─────────

describe('split instruction builders', () => {
  const input = {
    orderCode: 'SS-TEST01',
    amountPaise: 50000,
    storeLegs: [
      { storeId: 's1', storeSlug: 'pizza-corner', amountPaise: 30000, commissionPaise: 3600 },
      { storeId: 's2', storeSlug: 'wrap house', amountPaise: 15000, commissionPaise: 1800 },
    ],
  }

  test('razorpayTransfers: one transfer per store to its linked account', () => {
    const transfers = razorpayTransfers(input)
    expect(transfers).toHaveLength(2)
    expect(transfers[0]).toEqual({ account: 'acct_pizza-corner', amount: 30000, currency: 'INR', notes: { seatserve_order: 'SS-TEST01', store_id: 's1' } })
    expect(transfers[1].account).toBe('acct_wrap house')
  })

  test('cashfreeSplits: vendor splits + platform remainder', () => {
    const { splits, platform_amount } = cashfreeSplits(input)
    expect(splits).toEqual([
      { vendor_id: 'vend_pizza-corner', amount: 30000 },
      { vendor_id: 'vend_wrap house', amount: 15000 },
    ])
    expect(platform_amount).toBe(5000)
  })

  test('env overrides win over defaults', () => {
    process.env.RAZORPAY_ACCOUNT_PIZZA_CORNER = 'acct_real_123'
    expect(linkedAccountFor('pizza-corner')).toBe('acct_real_123')
    delete process.env.RAZORPAY_ACCOUNT_PIZZA_CORNER
  })
})

// ───────── ledger carries commission/tax per store ─────────

describe('ledger-driven settlement math', () => {
  const groups: StoreLineGroup[] = [
    {
      storeId: 'storeA',
      lines: [
        { unitPricePaise: 20000, qty: 2, taxRatePct: 5 }, // 40000
        { unitPricePaise: 15000, qty: 1, taxRatePct: 12 }, // 15000
      ],
      prepMinutes: [10, 8],
      fees: { commissionPct: 12, prepBufferMin: 5 },
    },
    {
      storeId: 'storeB',
      lines: [{ unitPricePaise: 8000, qty: 3, taxRatePct: 5 }], // 24000
      prepMinutes: [6],
      fees: { commissionPct: 10, prepBufferMin: 5 },
    },
  ]

  test('STORE rows carry their own commission; Σ splits === total; no tax/delivery rows', () => {
    const bill = computeBill(groups)
    const rows = computeSplits(bill)
    const total = rows.reduce((s, r) => s + r.amountPaise, 0)
    expect(total).toBe(bill.totalPaise)

    const storeRows = rows.filter((r) => r.beneficiary === 'STORE')
    expect(storeRows).toHaveLength(2)
    const a = storeRows.find((r) => r.storeId === 'storeA')!
    const b = storeRows.find((r) => r.storeId === 'storeB')!
    // storeA: subtotal 55000, commission 12% = 6600 → net 48400
    expect(a.commissionPaise).toBe(6600)
    expect(a.amountPaise).toBe(55000 - 6600)
    // storeB: subtotal 24000, commission 10% = 2400 → net 21600
    expect(b.commissionPaise).toBe(2400)
    expect(b.amountPaise).toBe(24000 - 2400)
    // no platform-held GST, no delivery fee: exactly one platform row
    expect(rows.filter((r) => r.beneficiary === 'PLATFORM_COMMISSION')).toHaveLength(1)
    for (const r of rows) expect(r.taxPaise).toBe(0)
  })

  test('leg reversal carries exact negative commission', () => {
    const bill = computeBill(groups)
    const reversal = computeLegReversal({
      orderSubtotalPaise: bill.subtotalPaise,
      orderPlatformFeePaise: bill.platformFeePaise,
      legSubtotalPaise: 24000,
      storeCommissionPct: 10,
      storeId: 'storeB',
    })
    const storeRow = reversal.rows.find((r) => r.beneficiary === 'STORE')!
    expect(storeRow.amountPaise).toBe(-(24000 - 2400))
    expect(storeRow.commissionPaise).toBe(-2400)
    // Σ negative rows === void total (settlement-internal, no customer refund)
    const sum = reversal.rows.reduce((s, r) => s + r.amountPaise, 0)
    expect(sum).toBe(-reversal.voidTotalPaise)
  })

  test('no online refunds by policy: only leg-void reversals exist', () => {
    // the reversal is settlement bookkeeping — the customer is never refunded
    // online, so the reversal must be strictly ledger-negative
    const bill = computeBill(groups)
    const reversal = computeLegReversal({
      orderSubtotalPaise: bill.subtotalPaise,
      orderPlatformFeePaise: bill.platformFeePaise,
      legSubtotalPaise: 24000,
      storeCommissionPct: 10,
      storeId: 'storeB',
    })
    for (const r of reversal.rows) expect(r.amountPaise).toBeLessThan(0)
  })
})
