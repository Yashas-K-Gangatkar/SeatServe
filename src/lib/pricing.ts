// SeatServe — pure money & split-settlement math.
// RULE: every amount is an INTEGER number of paise. Floating-point ₹ is forbidden.
// Menu prices are GST-INCLUSIVE (Indian menu convention). The tax component is
// extracted for reporting and is NOT settled to stores.

export function taxComponentPaise(gstInclusivePaise: number, taxRatePct: number): number {
  if (!Number.isInteger(gstInclusivePaise) || gstInclusivePaise < 0) throw new Error('amount must be a non-negative integer (paise)')
  if (taxRatePct < 0 || taxRatePct > 100) throw new Error('taxRatePct must be within 0..100')
  return Math.round((gstInclusivePaise * taxRatePct) / (100 + taxRatePct))
}

export interface PricedLineInput {
  unitPricePaise: number // GST-inclusive
  qty: number
  taxRatePct: number
}

export interface PricedLine extends PricedLineInput {
  lineTotalPaise: number
  taxPaise: number
}

export function priceLine({ unitPricePaise, qty, taxRatePct }: PricedLineInput): PricedLine {
  if (!Number.isInteger(qty) || qty < 1) throw new Error('qty must be a positive integer')
  const lineTotalPaise = unitPricePaise * qty
  return { unitPricePaise, qty, taxRatePct, lineTotalPaise, taxPaise: taxComponentPaise(lineTotalPaise, taxRatePct) }
}

export interface StoreFeeConfig {
  commissionPct: number
  deliveryFeePaise: number
  prepBufferMin: number // extra handling time for in-cinema delivery
}

export interface StoreLineGroup {
  storeId: string
  /** unpriced line inputs — computeBill prices them (idempotent if already priced) */
  lines: PricedLineInput[]
  /** per-line prep estimate in minutes (from Product.prepEstimateMin) */
  prepMinutes: number[]
  fees: StoreFeeConfig
}

export interface StoreSettlement {
  storeId: string
  subtotalPaise: number // GST-inclusive item total
  taxPaise: number // GST component within subtotal
  commissionPaise: number
  storeNetPaise: number // what the store settles for (subtotal − tax − commission)
  deliveryFeePaise: number
}

export interface BillBreakdown {
  subtotalPaise: number
  taxPaise: number
  deliveryFeePaise: number
  platformFeePaise: number
  totalPaise: number
  perStore: StoreSettlement[]
  prepEstimateMinutes: number
}

export interface PlatformFeeConfig {
  platformFeePct: number // % of subtotal charged to customer (convenience fee)
  platformFeeMinPaise: number
  platformFeeMaxPaise: number
  walkBufferMin: number // store → seat hand-to-customer buffer
}

export const DEFAULT_PLATFORM: PlatformFeeConfig = {
  platformFeePct: 3,
  platformFeeMinPaise: 500, // ₹5
  platformFeeMaxPaise: 2500, // ₹25
  walkBufferMin: 6,
}

/** Convenience fee charged to the customer, from configurable rules. */
export function platformFeePaise(subtotalPaise: number, cfg: PlatformFeeConfig): number {
  const raw = Math.round((subtotalPaise * cfg.platformFeePct) / 100)
  return Math.min(Math.max(raw, cfg.platformFeeMinPaise), cfg.platformFeeMaxPaise)
}

/**
 * Computes the full bill and per-store disbursement ledger.
 * Invariant (tested): Σ perStore.storeNet + Σ tax + platform + delivery == total,
 * and the Split rows (STORE×n + TAX + PLATFORM_COMMISSION + DELIVERY_FEE) sum to totalPaise.
 */
export function computeBill(groups: StoreLineGroup[], cfg: PlatformFeeConfig = DEFAULT_PLATFORM): BillBreakdown {
  if (groups.length === 0) throw new Error('at least one store group is required')

  let subtotalPaise = 0
  let taxPaise = 0
  let deliveryFeePaise = 0
  let maxPrep = 0
  const perStore: StoreSettlement[] = []

  for (const group of groups) {
    if (group.lines.length !== group.prepMinutes.length) throw new Error('prepMinutes must match lines')
    const priced = group.lines.map(priceLine)
    const storeSubtotal = priced.reduce((s, l) => s + l.lineTotalPaise, 0)
    const storeTax = priced.reduce((s, l) => s + l.taxPaise, 0)
    const commission = Math.round((storeSubtotal * group.fees.commissionPct) / 100)
    const storeNet = storeSubtotal - storeTax - commission
    if (storeNet < 0) throw new Error('commission cannot exceed store subtotal')

    subtotalPaise += storeSubtotal
    taxPaise += storeTax
    deliveryFeePaise += group.fees.deliveryFeePaise
    perStore.push({
      storeId: group.storeId,
      subtotalPaise: storeSubtotal,
      taxPaise: storeTax,
      commissionPaise: commission,
      storeNetPaise: storeNet,
      deliveryFeePaise: group.fees.deliveryFeePaise,
    })

    // store prep = slowest item + 2 min per additional unit (batch load) + store buffer
    const slowest = Math.max(...group.prepMinutes, 0)
    const extraUnits = group.lines.reduce((s, l) => s + l.qty - 1, 0)
    const storePrep = slowest + extraUnits * 2 + group.fees.prepBufferMin
    maxPrep = Math.max(maxPrep, storePrep)
  }

  const platformFee = platformFeePaise(subtotalPaise, cfg)
  const totalPaise = subtotalPaise + deliveryFeePaise + platformFee

  return {
    subtotalPaise,
    taxPaise,
    deliveryFeePaise,
    platformFeePaise: platformFee,
    totalPaise,
    perStore,
    prepEstimateMinutes: maxPrep + cfg.walkBufferMin,
  }
}

/** Split ledger rows for an order — Σ amounts === totalPaise (invariant, tested). */
export interface SplitRow {
  storeId: string | null
  beneficiary: 'STORE' | 'PLATFORM_COMMISSION' | 'DELIVERY_FEE' | 'TAX'
  amountPaise: number
  /** Phase 3: STORE rows carry their own commission & tax so settlement is ledger-driven */
  commissionPaise: number
  taxPaise: number
}

export function computeSplits(bill: BillBreakdown): SplitRow[] {
  const rows: SplitRow[] = []
  let commissionTotal = 0
  for (const s of bill.perStore) {
    rows.push({
      storeId: s.storeId,
      beneficiary: 'STORE',
      amountPaise: s.storeNetPaise,
      commissionPaise: s.commissionPaise,
      taxPaise: s.taxPaise,
    })
    commissionTotal += s.commissionPaise
  }
  rows.push({ storeId: null, beneficiary: 'TAX', amountPaise: bill.taxPaise, commissionPaise: 0, taxPaise: bill.taxPaise })
  rows.push({ storeId: null, beneficiary: 'PLATFORM_COMMISSION', amountPaise: bill.platformFeePaise + commissionTotal, commissionPaise: 0, taxPaise: 0 })
  rows.push({ storeId: null, beneficiary: 'DELIVERY_FEE', amountPaise: bill.deliveryFeePaise, commissionPaise: 0, taxPaise: 0 })
  return rows
}

export function rupees(paise: number): string {
  const sign = paise < 0 ? '-' : ''
  const abs = Math.abs(paise)
  return `${sign}₹${(abs / 100).toLocaleString('en-IN', { minimumFractionDigits: abs % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`
}
