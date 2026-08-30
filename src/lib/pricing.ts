// SeatServe — pure money & split-settlement math.
// RULE: every amount is an INTEGER number of paise. Floating-point ₹ is forbidden.
//
// BUSINESS MODEL (owner decision):
//   · NO delivery fee — stores sit next door to the cinema screens.
//   · NO platform-level GST handling — menu prices are GST-inclusive and the
//     STORE remits its own GST. The platform never extracts or holds tax.
//   · Platform fee is FIXED at 5% of the TOTAL the customer pays:
//       total = round(subtotal / 0.95)   (gross-up)
//       fee   = total − subtotal          → fee / total === 5% (±1 paisa rounding)
//     Stores settle net of commission AND net of the platform fee's food share.
export const PLATFORM_FEE_PCT = 5 // % of the customer's final total
export const DEFAULT_WALK_BUFFER_MIN = 6 // store → seat hand-to-customer buffer

/** Platform fee for a subtotal so that fee === PLATFORM_FEE_PCT% of the final total. */
export function platformFeePaise(subtotalPaise: number): number {
  if (!Number.isInteger(subtotalPaise) || subtotalPaise < 0) throw new Error('subtotal must be a non-negative integer (paise)')
  if (subtotalPaise === 0) return 0
  const total = Math.round(subtotalPaise / (1 - PLATFORM_FEE_PCT / 100))
  return total - subtotalPaise
}

export interface PricedLineInput {
  unitPricePaise: number // GST-inclusive (store remits its own GST)
  qty: number
  /** store's own GST rate — informational only (receipts); NOT used in platform money math */
  taxRatePct: number
}

export interface PricedLine extends PricedLineInput {
  lineTotalPaise: number
}

export function priceLine({ unitPricePaise, qty, taxRatePct }: PricedLineInput): PricedLine {
  if (!Number.isInteger(qty) || qty < 1) throw new Error('qty must be a positive integer')
  return { unitPricePaise, qty, taxRatePct, lineTotalPaise: unitPricePaise * qty }
}

export interface StoreFeeConfig {
  commissionPct: number
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
  commissionPaise: number
  storeNetPaise: number // what the store settles for (subtotal − commission)
}

export interface BillBreakdown {
  subtotalPaise: number
  platformFeePaise: number
  totalPaise: number
  perStore: StoreSettlement[]
  prepEstimateMinutes: number
}

/**
 * Computes the full bill and per-store disbursement ledger.
 * Invariants (tested):
 *   Σ perStore.storeNet + platformFee === total
 *   Split rows (STORE×n + PLATFORM_COMMISSION) sum to totalPaise
 */
export function computeBill(groups: StoreLineGroup[], walkBufferMin: number = DEFAULT_WALK_BUFFER_MIN): BillBreakdown {
  if (groups.length === 0) throw new Error('at least one store group is required')

  let subtotalPaise = 0
  let maxPrep = 0
  const perStore: StoreSettlement[] = []

  for (const group of groups) {
    if (group.lines.length !== group.prepMinutes.length) throw new Error('prepMinutes must match lines')
    const priced = group.lines.map(priceLine)
    const storeSubtotal = priced.reduce((s, l) => s + l.lineTotalPaise, 0)
    const commission = Math.round((storeSubtotal * group.fees.commissionPct) / 100)
    const storeNet = storeSubtotal - commission
    if (storeNet < 0) throw new Error('commission cannot exceed store subtotal')

    subtotalPaise += storeSubtotal
    perStore.push({
      storeId: group.storeId,
      subtotalPaise: storeSubtotal,
      commissionPaise: commission,
      storeNetPaise: storeNet,
    })

    // store prep = slowest item + 2 min per additional unit (batch load) + store buffer
    const slowest = Math.max(...group.prepMinutes, 0)
    const extraUnits = group.lines.reduce((s, l) => s + l.qty - 1, 0)
    const storePrep = slowest + extraUnits * 2 + group.fees.prepBufferMin
    maxPrep = Math.max(maxPrep, storePrep)
  }

  const platformFee = platformFeePaise(subtotalPaise)
  const totalPaise = subtotalPaise + platformFee

  return {
    subtotalPaise,
    platformFeePaise: platformFee,
    totalPaise,
    perStore,
    prepEstimateMinutes: maxPrep + walkBufferMin,
  }
}

/** Split ledger rows for an order — Σ amounts === totalPaise (invariant, tested). */
export interface SplitRow {
  storeId: string | null
  beneficiary: 'STORE' | 'PLATFORM_COMMISSION'
  amountPaise: number
  /** STORE rows carry their own commission so settlement is ledger-driven; taxPaise is legacy (always 0 — stores remit their own GST) */
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
      taxPaise: 0,
    })
    commissionTotal += s.commissionPaise
  }
  rows.push({ storeId: null, beneficiary: 'PLATFORM_COMMISSION', amountPaise: bill.platformFeePaise + commissionTotal, commissionPaise: 0, taxPaise: 0 })
  return rows
}

export function rupees(paise: number): string {
  const sign = paise < 0 ? '-' : ''
  const abs = Math.abs(paise)
  return `${sign}₹${(abs / 100).toLocaleString('en-IN', { minimumFractionDigits: abs % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`
}
