// SeatServe — refund & split-reversal math (pure where possible).
//
// Audit fixes #2/#5: refunds used to dead-end (nothing could ever action a
// request) and a cancelled ticket kept its FULL settlement splits — the store
// would have been paid for food never made. Now every money movement writes
// NEGATIVE adjustment rows into the same split ledger, so:
//   Σ(all positive split rows) − Σ(all adjustment rows) === net settled
//   and the pending-settlement view (Σ PENDING) stays exact.
//
// Adjustment rows carry settlementStatus:
//   VOIDED   — leg cancelled before fulfilment (never owed)
//   REFUNDED — money actually returned to the customer
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { taxComponentPaise } from '@/lib/pricing'

export interface LegReversal {
  /** per-beneficiary negative amounts, Σ === refundTotalPaise */
  rows: {
    storeId: string | null
    beneficiary: 'STORE' | 'PLATFORM_COMMISSION' | 'DELIVERY_FEE' | 'TAX'
    amountPaise: number
    commissionPaise: number
    taxPaise: number
  }[]
  refundTotalPaise: number
}

/**
 * Computes the reversal for ONE cancelled store leg.
 * The customer is made whole for everything attributable to that leg:
 *   refund = legSubtotal + leg delivery fee + leg share of the platform fee
 * Ledger impact (all negative):
 *   STORE  = −(legSubtotal − legTax − legCommission)   (store never owed it)
 *   TAX    = −legTax
 *   DELIVERY_FEE = −leg delivery fee
 *   PLATFORM_COMMISSION = −(legCommission + platformShare)
 */
export function computeLegReversal(input: {
  orderSubtotalPaise: number
  orderPlatformFeePaise: number
  legSubtotalPaise: number
  legTaxPaise: number
  storeCommissionPct: number
  storeDeliveryFeePaise: number
  storeId: string
}): LegReversal {
  const commission = Math.round((input.legSubtotalPaise * input.storeCommissionPct) / 100)
  const storeNet = input.legSubtotalPaise - input.legTaxPaise - commission
  const platformShare =
    input.orderSubtotalPaise > 0
      ? Math.round((input.orderPlatformFeePaise * input.legSubtotalPaise) / input.orderSubtotalPaise)
      : 0
  const refundTotal = input.legSubtotalPaise + input.storeDeliveryFeePaise + platformShare

  return {
    refundTotalPaise: refundTotal,
    rows: [
      { storeId: input.storeId, beneficiary: 'STORE', amountPaise: -storeNet, commissionPaise: -commission, taxPaise: -input.legTaxPaise },
      { storeId: null, beneficiary: 'TAX', amountPaise: -input.legTaxPaise, commissionPaise: 0, taxPaise: -input.legTaxPaise },
      { storeId: null, beneficiary: 'DELIVERY_FEE', amountPaise: -input.storeDeliveryFeePaise, commissionPaise: 0, taxPaise: 0 },
      { storeId: null, beneficiary: 'PLATFORM_COMMISSION', amountPaise: -(commission + platformShare), commissionPaise: 0, taxPaise: 0 },
    ],
  }
}

/** Per-leg tax from the order's line items (exact per-line GST extraction). */
export function legTaxFromItems(items: { storeId: string; lineTotalPaise: number; taxRatePct: number }[], storeId: string): number {
  return items
    .filter((i) => i.storeId === storeId)
    .reduce((sum, i) => sum + taxComponentPaise(i.lineTotalPaise, i.taxRatePct), 0)
}

/**
 * Reverses an arbitrary refund amount proportionally across an order's
 * POSITIVE split rows (largest-remainder, exact Σ). Used by the finance
 * action on refund PROCESS.
 *
 * Phase 3: negative STORE rows also carry their proportional share of the
 * original row's commission & tax (largest-remainder over the STORE rows),
 * so settlement stays ledger-driven and Σ commission reversal is exact.
 */
export function computeProportionalReversal(
  positiveSplits: {
    /** DB rows carry their row id; pure SplitRow (computeSplits) may omit it — never used positionally-independent */
    id?: string
    storeId: string | null
    beneficiary: 'STORE' | 'PLATFORM_COMMISSION' | 'DELIVERY_FEE' | 'TAX'
    amountPaise: number
    commissionPaise?: number
    taxPaise?: number
  }[],
  refundAmountPaise: number,
): { storeId: string | null; beneficiary: 'STORE' | 'PLATFORM_COMMISSION' | 'DELIVERY_FEE' | 'TAX'; amountPaise: number; commissionPaise: number; taxPaise: number }[] {
  const total = positiveSplits.reduce((s, r) => s + r.amountPaise, 0)
  if (total <= 0 || refundAmountPaise <= 0) return []
  const clamped = Math.min(refundAmountPaise, total)

  const raw = positiveSplits.map((r) => (r.amountPaise * clamped) / total)
  const floors = raw.map((v) => Math.floor(v))
  let remainder = clamped - floors.reduce((s, f) => s + f, 0)
  // distribute leftover paise to the largest fractional parts
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
  for (let k = 0; remainder > 0; k = (k + 1) % order.length) {
    floors[order[k].i] += 1
    remainder -= 1
  }

  // Phase 3: proportional commission/tax share per negative STORE row (exact Σ
  // via largest remainder over the STORE rows' own components, shares ≤ components
  // because each reversed share ≤ its row amount).
  const commissionFloors = distributeComponent(positiveSplits, floors, 'commissionPaise')
  const taxFloors = distributeComponent(positiveSplits, floors, 'taxPaise')

  return positiveSplits
    .map((r, i) => ({
      storeId: r.storeId,
      beneficiary: r.beneficiary,
      amountPaise: -floors[i],
      commissionPaise: r.beneficiary === 'STORE' ? -(commissionFloors.get(i) ?? 0) : 0,
      taxPaise: r.beneficiary === 'STORE' ? -(taxFloors.get(i) ?? 0) : r.beneficiary === 'TAX' ? -floors[i] : 0,
    }))
    .filter((r) => r.amountPaise !== 0)
}

/**
 * Distributes each positive STORE row's component (commission or tax)
 * proportionally to its reversed share (base/rowAmount), largest-remainder
 * exact. Returns index → component-paise for the negative rows.
 */
function distributeComponent(
  positiveSplits: { beneficiary: string; amountPaise: number; commissionPaise?: number; taxPaise?: number }[],
  bases: number[],
  field: 'commissionPaise' | 'taxPaise',
): Map<number, number> {
  const out = new Map<number, number>()
  const rows = positiveSplits
    .map((r, i) => ({ i, amount: r.amountPaise, base: bases[i], component: (r[field] as number | undefined) ?? 0 }))
    .filter((x) => x.base > 0 && x.component > 0)
  if (rows.length === 0) return out

  const raw = rows.map((x) => (x.base * x.component) / x.amount)
  const floors = raw.map((v) => Math.floor(v))
  // the true proportional total may exceed Σ floors by < rows.length paise
  const rawTotal = raw.reduce((s, v) => s + v, 0)
  let remainder = Math.floor(rawTotal) - floors.reduce((s, f) => s + f, 0)
  const ord = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
  for (let k = 0; remainder > 0; k = (k + 1) % ord.length) {
    floors[ord[k].i] += 1
    remainder -= 1
  }
  rows.forEach((x, j) => out.set(x.i, Math.min(floors[j], x.component)))
  return out
}

// ───────────────────────── DB effects ─────────────────────────

/** Writes VOIDED adjustment rows for a cancelled leg + opens an APPROVED refund when the order was paid. */
export async function voidStoreLeg(orderId: string, storeId: string): Promise<{ refundTotalPaise: number } | null> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } })
  if (!order) return null
  const ticket = await db.storeTicket.findFirst({ where: { orderId, storeId } })
  if (!ticket) return null
  const store = await db.store.findUnique({ where: { id: storeId } })
  if (!store) return null

  const legTax = legTaxFromItems(
    order.items.map((i) => ({ storeId: i.storeId, lineTotalPaise: i.lineTotalPaise, taxRatePct: i.taxRatePct })),
    storeId,
  )
  const reversal = computeLegReversal({
    orderSubtotalPaise: order.subtotalPaise,
    orderPlatformFeePaise: order.platformFeePaise,
    legSubtotalPaise: ticket.subtotalPaise,
    legTaxPaise: legTax,
    storeCommissionPct: store.commissionPct,
    storeDeliveryFeePaise: store.deliveryFeePaise,
    storeId,
  })

  await db.split.createMany({
    data: reversal.rows.map((r) => ({
      orderId,
      storeId: r.storeId,
      beneficiary: r.beneficiary,
      amountPaise: r.amountPaise,
      commissionPaise: r.commissionPaise,
      taxPaise: r.taxPaise,
      settlementStatus: 'VOIDED',
    })),
  })

  // unpaid orders: nothing to refund — the void itself is the whole story
  if (order.paymentStatus === 'PAID') {
    await db.refund.create({
      data: {
        orderId,
        amountPaise: reversal.refundTotalPaise,
        reason: 'PARTIAL_STORE_CANCEL',
        detail: `Auto-opened: ${store.name} leg cancelled before fulfilment`,
        status: 'APPROVED',
        requestedByRole: 'SYSTEM',
      },
    })
  }

  await audit({
    actorRole: 'SYSTEM',
    action: 'STORE_LEG_VOIDED',
    entityType: 'StoreTicket',
    entityId: ticket.id,
    orderId,
    mallId: order.mallId,
    meta: { storeId, refundTotalPaise: reversal.refundTotalPaise, ticketCode: ticket.ticketCode },
  })

  return { refundTotalPaise: reversal.refundTotalPaise }
}

/** Finance PROCESS: negative REFUNDED rows + order money state. Returns the actually-processed amount. */
export async function applyRefundToLedger(orderId: string, requestedAmountPaise: number): Promise<number> {
  const order = await db.order.findUnique({ where: { id: orderId } })
  if (!order) return 0

  const alreadyRefunded = order.refundedPaise
  const maxRefundable = order.totalPaise - alreadyRefunded
  const amount = Math.max(0, Math.min(requestedAmountPaise, maxRefundable))
  if (amount === 0) return 0

  const positive = await db.split.findMany({
    where: { orderId, amountPaise: { gt: 0 } },
    select: { id: true, storeId: true, beneficiary: true, amountPaise: true, commissionPaise: true, taxPaise: true },
  })
  const rows = computeProportionalReversal(
    positive.map((p) => ({ ...p, beneficiary: p.beneficiary as 'STORE' | 'PLATFORM_COMMISSION' | 'DELIVERY_FEE' | 'TAX' })),
    amount,
  )
  if (rows.length > 0) {
    await db.split.createMany({
      data: rows.map((r) => ({
        orderId,
        storeId: r.storeId,
        beneficiary: r.beneficiary,
        amountPaise: r.amountPaise,
        commissionPaise: r.commissionPaise,
        taxPaise: r.taxPaise,
        settlementStatus: 'REFUNDED',
      })),
    })
  }

  const newRefunded = alreadyRefunded + amount
  await db.order.update({
    where: { id: orderId },
    data: {
      refundedPaise: newRefunded,
      paymentStatus: newRefunded >= order.totalPaise ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
    },
  })
  return amount
}
