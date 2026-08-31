// SeatServe — store-leg void math for settlement fairness (no refunds).
//
// POLICY: the cinema does not refund online. When a store leg is cancelled
// before fulfilment, the only money effect is SETTLEMENT-INTERNAL: negative
// VOIDED rows so the store is never paid for food it never made. Customer
// exceptions are resolved in person at the counter.
//
//   Σ(all positive split rows) − Σ(all VOIDED rows) === net owed to stores
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'

export interface LegReversal {
  /** per-beneficiary negative amounts, Σ === voidTotalPaise */
  rows: {
    storeId: string | null
    beneficiary: 'STORE' | 'PLATFORM_COMMISSION'
    amountPaise: number
    commissionPaise: number
    taxPaise: number
  }[]
  voidTotalPaise: number
}

/**
 * Computes the reversal for ONE cancelled store leg (ledger only — the
 * customer is NOT refunded online):
 *   STORE               = −(legSubtotal − legCommission)   (store never owed it)
 *   PLATFORM_COMMISSION = −(commission + platform fee share of that leg)
 */
export function computeLegReversal(input: {
  orderSubtotalPaise: number
  orderPlatformFeePaise: number
  legSubtotalPaise: number
  storeCommissionPct: number
  storeId: string
}): LegReversal {
  const commission = Math.round((input.legSubtotalPaise * input.storeCommissionPct) / 100)
  const storeNet = input.legSubtotalPaise - commission
  const platformShare =
    input.orderSubtotalPaise > 0
      ? Math.round((input.orderPlatformFeePaise * input.legSubtotalPaise) / input.orderSubtotalPaise)
      : 0
  // Σ rows === legSubtotal + platformShare: (−storeNet) + (−(commission+share)) = −(legSubtotal+share)
  const voidTotal = input.legSubtotalPaise + platformShare
  return {
    voidTotalPaise: voidTotal,
    rows: [
      { storeId: input.storeId, beneficiary: 'STORE', amountPaise: -storeNet, commissionPaise: -commission, taxPaise: 0 },
      { storeId: null, beneficiary: 'PLATFORM_COMMISSION', amountPaise: -(commission + platformShare), commissionPaise: 0, taxPaise: 0 },
    ],
  }
}

/** Writes VOIDED adjustment rows for a cancelled leg — settlement bookkeeping only, no customer money moves. */
export async function voidStoreLeg(orderId: string, storeId: string): Promise<{ voidTotalPaise: number } | null> {
  const order = await db.order.findUnique({ where: { id: orderId } })
  if (!order) return null
  const ticket = await db.storeTicket.findFirst({ where: { orderId, storeId } })
  if (!ticket) return null
  const store = await db.store.findUnique({ where: { id: storeId } })
  if (!store) return null

  const reversal = computeLegReversal({
    orderSubtotalPaise: order.subtotalPaise,
    orderPlatformFeePaise: order.platformFeePaise,
    legSubtotalPaise: ticket.subtotalPaise,
    storeCommissionPct: store.commissionPct,
    storeId,
  })

  await db.split.createMany({
    data: reversal.rows.map((r) => ({
      orderId,
      storeId: r.storeId,
      beneficiary: r.beneficiary,
      amountPaise: r.amountPaise,
      commissionPaise: r.commissionPaise,
      taxPaise: 0,
      settlementStatus: 'VOIDED',
    })),
  })

  await audit({
    actorRole: 'SYSTEM',
    action: 'STORE_LEG_VOIDED',
    entityType: 'StoreTicket',
    entityId: ticket.id,
    orderId,
    mallId: order.mallId,
    meta: { storeId, voidTotalPaise: reversal.voidTotalPaise, ticketCode: ticket.ticketCode },
  })

  return { voidTotalPaise: reversal.voidTotalPaise }
}
