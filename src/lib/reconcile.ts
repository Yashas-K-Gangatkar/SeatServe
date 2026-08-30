// SeatServe Phase 3 — reconciliation: prove the money ledger is self-consistent.
//
// For every order in scope, five invariants must hold:
//   R1  Σ positive split rows === order.totalPaise            (creation invariant)
//   R2  order.refundedPaise   === Σ REFUNDED rows (|amount|)  (refund bookkeeping)
//   R3  paymentStatus REFUNDED ⇔ refundedPaise === totalPaise (full-refund closure)
//   R4  every PAID order has exactly one SUCCESS payment and it is for totalPaise
//   R5  every SUCCESS payment carries a signature-valid payment.captured event
//
// A violation never blocks reads — it is REPORTED for finance follow-up.
// The golden-path test intentionally corrupts a ledger row and expects the
// report to go unhealthy.

import { db } from '@/lib/db'

export interface ReconciliationIssue {
  orderCode: string
  check: 'R1_LEDGER_TOTAL' | 'R2_REFUND_TOTAL' | 'R3_FULL_REFUND_CLOSURE' | 'R4_PAYMENT_TOTAL' | 'R5_EVENT_AUDIT'
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
    select: { id: true, code: true, totalPaise: true, refundedPaise: true, paymentStatus: true },
    orderBy: { placedAt: 'desc' },
    take: 500, // report bound — sandbox-sized
  })

  const issues: ReconciliationIssue[] = []
  const passes: Record<string, number> = {
    R1_LEDGER_TOTAL: 0,
    R2_REFUND_TOTAL: 0,
    R3_FULL_REFUND_CLOSURE: 0,
    R4_PAYMENT_TOTAL: 0,
    R5_EVENT_AUDIT: 0,
  }

  for (const order of orders) {
    const [positiveSum, refundedRows, successPayments, capturedEvents] = await Promise.all([
      db.split.aggregate({ where: { orderId: order.id, amountPaise: { gt: 0 } }, _sum: { amountPaise: true } }),
      db.split.aggregate({ where: { orderId: order.id, settlementStatus: 'REFUNDED' }, _sum: { amountPaise: true } }),
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

    // R2 — refund bookkeeping
    const refundedLedger = Math.abs(refundedRows._sum.amountPaise ?? 0)
    if (refundedLedger === order.refundedPaise) {
      passes.R2_REFUND_TOTAL += 1
    } else {
      issues.push({
        orderCode: order.code,
        check: 'R2_REFUND_TOTAL',
        expected: String(order.refundedPaise),
        actual: String(refundedLedger),
      })
    }

    // R3 — full-refund closure
    if (order.paymentStatus === 'REFUNDED' ? order.refundedPaise === order.totalPaise : true) {
      passes.R3_FULL_REFUND_CLOSURE += 1
    } else {
      issues.push({
        orderCode: order.code,
        check: 'R3_FULL_REFUND_CLOSURE',
        expected: `refundedPaise=${order.totalPaise} when paymentStatus=REFUNDED`,
        actual: `refundedPaise=${order.refundedPaise}`,
      })
    }

    // R4 — payment totals
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
