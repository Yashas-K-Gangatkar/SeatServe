// SeatServe Phase 3 — reconciliation: prove the money ledger is self-consistent.
//
// For every order in scope, five invariants must hold:
//   R1  Σ positive split rows === order.totalPaise            (creation invariant)
//   R2  every adjustment row is negative (VOIDED bookkeeping only)
//   R3  Σ |adjustment rows| ≤ order.totalPaise                (void bound)
//   R4  every PAID order has exactly one SUCCESS payment and it is for totalPaise
//   R5  every SUCCESS payment carries a signature-valid payment.captured event
//
// There are no online refunds (cinema policy): negative rows are settlement-
// internal VOIDED rows for store legs cancelled before fulfilment. Legacy
// REFUNDED rows from before the policy change are treated as adjustments too.
//
// A violation never blocks reads — it is REPORTED for finance follow-up.
// The golden-path test intentionally corrupts a ledger row and expects the
// report to go unhealthy.

import { db } from '@/lib/db'

export interface ReconciliationIssue {
  orderCode: string
  check: 'R1_LEDGER_TOTAL' | 'R2_ADJUST_NEGATIVE' | 'R3_VOID_BOUND' | 'R4_PAYMENT_TOTAL' | 'R5_EVENT_AUDIT'
  expected: string
  actual: string
}

export interface ReconciliationReport {
  checkedAt: string
  scope: { mallId: string | null; mallName: string | null }
  ordersChecked: number
  healthy: boolean
  issues: ReconciliationIssue[]
  checks: Record<string, number> // per-check pass counts, for the UI
}

export async function reconcileOrders(mallId: string | null): Promise<ReconciliationReport> {
  const orders = await db.order.findMany({
    where: mallId ? { mallId } : {},
    select: { id: true, code: true, totalPaise: true, paymentStatus: true },
    orderBy: { placedAt: 'desc' },
    take: 500, // report bound — sandbox-sized
  })

  const issues: ReconciliationIssue[] = []
  const passes: Record<string, number> = {
    R1_LEDGER_TOTAL: 0,
    R2_ADJUST_NEGATIVE: 0,
    R3_VOID_BOUND: 0,
    R4_PAYMENT_TOTAL: 0,
    R5_EVENT_AUDIT: 0,
  }

  for (const order of orders) {
    const [positiveSum, adjustmentRows, successPayments, capturedEvents] = await Promise.all([
      db.split.aggregate({ where: { orderId: order.id, amountPaise: { gt: 0 } }, _sum: { amountPaise: true } }),
      db.split.findMany({ where: { orderId: order.id, amountPaise: { lt: 0 } }, select: { amountPaise: true, settlementStatus: true } }),
      db.payment.findMany({ where: { orderId: order.id, status: 'SUCCESS' }, select: { id: true, amountPaise: true, providerRef: true } }),
      db.paymentEvent.findMany({ where: { payment: { orderId: order.id } }, select: { eventType: true, signatureValid: true } }),
    ])

    // R1 — creation invariant
    if ((positiveSum._sum.amountPaise ?? 0) === order.totalPaise) {
      passes.R1_LEDGER_TOTAL += 1
    } else {
      issues.push({
        orderCode: order.code,
        check: 'R1_LEDGER_TOTAL',
        expected: String(order.totalPaise),
        actual: String(positiveSum._sum.amountPaise ?? 0),
      })
    }

    // R2 — adjustment rows must be negative ledger rows (VOIDED; legacy REFUNDED tolerated)
    const badAdjust = adjustmentRows.filter((r) => r.amountPaise >= 0 || !['VOIDED', 'REFUNDED'].includes(r.settlementStatus))
    if (badAdjust.length === 0) {
      passes.R2_ADJUST_NEGATIVE += 1
    } else {
      issues.push({
        orderCode: order.code,
        check: 'R2_ADJUST_NEGATIVE',
        expected: 'all adjustment rows negative VOIDED/REFUNDED',
        actual: `${badAdjust.length} bad adjustment row(s)`,
      })
    }

    // R3 — void bound: reversals can never exceed what the customer paid
    const adjustTotal = Math.abs(adjustmentRows.reduce((s, r) => s + r.amountPaise, 0))
    if (adjustTotal <= order.totalPaise) {
      passes.R3_VOID_BOUND += 1
    } else {
      issues.push({
        orderCode: order.code,
        check: 'R3_VOID_BOUND',
        expected: `adjustments ≤ ${order.totalPaise}`,
        actual: String(adjustTotal),
      })
    }

    // R4 — payment totals (legacy refund statuses still mean money was captured)
    const paid = order.paymentStatus === 'PAID' || order.paymentStatus === 'PARTIALLY_REFUNDED' || order.paymentStatus === 'REFUNDED'
    if (!paid) {
      passes.R4_PAYMENT_TOTAL += 1
    } else if (successPayments.length === 1 && successPayments[0].amountPaise === order.totalPaise) {
      passes.R4_PAYMENT_TOTAL += 1
    } else {
      issues.push({
        orderCode: order.code,
        check: 'R4_PAYMENT_TOTAL',
        expected: `1 SUCCESS payment of ${order.totalPaise}`,
        actual: `${successPayments.length} SUCCESS payment(s), Σ ${successPayments.reduce((s, p) => s + p.amountPaise, 0)}`,
      })
    }

    // R5 — every SUCCESS payment has a signature-valid captured event
    const okEvents = capturedEvents.filter((e) => e.signatureValid && e.eventType === 'payment.captured').length
    if (successPayments.length === 0 ? okEvents === 0 : okEvents >= 1) {
      passes.R5_EVENT_AUDIT += 1
    } else {
      issues.push({
        orderCode: order.code,
        check: 'R5_EVENT_AUDIT',
        expected: '≥1 signature-valid payment.captured event',
        actual: `${okEvents} valid captured event(s)`,
      })
    }
  }

  let mallName: string | null = null
  if (mallId) {
    const mall = await db.mall.findUnique({ where: { id: mallId }, select: { name: true } })
    mallName = mall?.name ?? null
  }

  return {
    checkedAt: new Date().toISOString(),
    scope: { mallId, mallName },
    ordersChecked: orders.length,
    healthy: issues.length === 0,
    issues,
    checks: passes,
  }
}
