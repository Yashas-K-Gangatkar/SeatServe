// POST /api/orders/[code]/cancel — customer cancel BEFORE any store accepts.
//
// OWNER RULE (the refund window): from payment until the store taps
// "Accept ticket" the customer may cancel from the tracking screen and the
// money returns to source automatically. The moment ANY store leg is
// accepted, the order is LOCKED — this endpoint refuses with 409 and the
// customer UI hides the button. Stores are instructed to accept fast,
// which keeps this window short by design.
//
// Guards (all enforced server-side, the UI hiding is a courtesy only):
//   1. order is PAID and not already cancelled
//   2. every store ticket is still NEW (atomic claim in a transaction)
//   3. payment was captured within the last 10 minutes (a stolen tracking
//      code cannot cancel an old order hours later)
// Money: RAZORPAY → real refund to source via the refunds API;
// SANDBOX_MOCK → local record only (no gateway exists).

import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'
import { voidStoreLeg } from '@/lib/leg-voids'
import { refundRazorpayPayment } from '@/lib/payments/gateway-client'

const CANCEL_WINDOW_MS = 10 * 60_000

export async function POST(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  let { code } = await params
  code = code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
  if (!code.startsWith('SS-')) code = `SS-${code}`

  const order = await db.order.findUnique({
    where: { code },
    include: { tickets: true, payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
  })
  if (!order) return fail('Order not found. Check the order ID.', 404)
  if (order.status === 'CANCELLED') return fail('This order was already cancelled', 409)
  if (order.paymentStatus !== 'PAID') return fail('Only paid orders can be cancelled here', 409)

  const payment = order.payments[0]
  if (!payment) return fail('No payment found for this order', 409)

  const notNew = order.tickets.filter((t) => t.status !== 'NEW')
  if (notNew.length > 0) {
    return fail('The store already accepted your order — it is locked in now', 409)
  }

  const capturedAt = payment.updatedAt.getTime()
  if (Date.now() - capturedAt > CANCEL_WINDOW_MS) {
    return fail('The cancel window closed — the store will have seen the ticket by now', 409)
  }

  // Atomic claim: cancel every NEW ticket in one transaction. If any leg was
  // accepted between our check and now, the count mismatches and we refuse —
  // acceptance always wins the race against cancellation.
  const claimed = await db.$transaction(async (tx) => {
    const res = await tx.storeTicket.updateMany({
      where: { orderId: order.id, status: 'NEW' },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledByRole: 'CUSTOMER' },
    })
    if (res.count !== order.tickets.length) throw new Error('ACCEPTED_RACE')
    await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } })
    return res.count
  }).catch((err) => {
    if (err instanceof Error && err.message === 'ACCEPTED_RACE') return null
    throw err
  })
  if (claimed === null) return fail('The store already accepted your order — it is locked in now', 409)
  if (claimed === 0) return fail('Nothing to cancel', 409)

  // Ledger: every store leg is voided — no store is owed money for food it
  // never made, and the platform commission row is reversed with it.
  const storeIds = [...new Set(order.tickets.map((t) => t.storeId))]
  for (const storeId of storeIds) {
    await voidStoreLeg(order.id, storeId)
  }

  await audit({
    actorRole: 'CUSTOMER',
    action: 'ORDER_CANCELLED_BEFORE_ACCEPT',
    entityType: 'Order',
    entityId: order.id,
    orderId: order.id,
    mallId: order.mallId,
    meta: { code: order.code, ticketsCancelled: claimed, windowMs: CANCEL_WINDOW_MS },
  })

  // Money back to source. If the gateway refuses, the cancellation stands
  // (no food will be made) and the refund is flagged for support follow-up —
  // never silently dropped.
  let refund: { provider: string; refundId: string; status: string; amountPaise: number }
  if (payment.provider === 'RAZORPAY') {
    const r = await refundRazorpayPayment({
      paymentId: payment.providerRef,
      amountPaise: order.totalPaise,
      orderCode: order.code,
    })
    if (!r.ok) {
      await audit({
        actorRole: 'SYSTEM',
        action: 'REFUND_FAILED_NEEDS_SUPPORT',
        entityType: 'Payment',
        entityId: payment.id,
        orderId: order.id,
        mallId: order.mallId,
        meta: { code: order.code, gatewayPaymentId: payment.providerRef, amountPaise: order.totalPaise, error: r.error },
      })
      return fail('Order cancelled — the refund needs manual completion and support has been notified. No food will be made.', 502)
    }
    refund = { provider: 'RAZORPAY', refundId: r.refundId, status: r.status, amountPaise: order.totalPaise }
  } else {
    refund = { provider: payment.provider, refundId: `rfnd_local_${Date.now().toString(36)}`, status: 'processed', amountPaise: order.totalPaise }
  }

  await audit({
    actorRole: 'SYSTEM',
    action: 'REFUND_INITIATED',
    entityType: 'Payment',
    entityId: payment.id,
    orderId: order.id,
    mallId: order.mallId,
    meta: { code: order.code, provider: refund.provider, gatewayRefundId: refund.refundId, amountPaise: refund.amountPaise },
  })

  // fanout: customer tracking refreshes, store kitchens drop the ticket
  await emitToRooms({ rooms: [`order:${order.code}`], event: 'order:update', data: { code: order.code, status: 'CANCELLED' } })
  for (const storeId of storeIds) {
    await emitToRooms({
      rooms: [`store:${storeId}`, `admin:${order.mallId}`],
      event: 'ticket:cancelled',
      data: { orderCode: order.code, ticketId: order.tickets.find((t) => t.storeId === storeId)?.id },
    })
  }

  return ok({ cancelled: true, refund })
}
