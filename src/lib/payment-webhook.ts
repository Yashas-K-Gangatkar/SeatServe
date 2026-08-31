// SeatServe — payment webhook processing (shared by the real webhook route and
// the sandbox gateway loop). Phase 3: signature verification is delegated to the
// provider adapters (SANDBOX_MOCK | RAZORPAY | CASHFREE — see lib/payments/
// provider.ts); this module owns duplicate-event protection + state transitions
// + realtime fanout, and works on NORMALIZED events so the money logic never
// sees provider specifics.

import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'
import { verifyWebhookMultiProvider, type NormalizedPaymentEvent } from '@/lib/payments/provider'

export type ProcessResult =
  | { ok: true; outcome: 'captured' | 'failed' | 'duplicate' | 'already_paid' | 'refund_processed'; eventId: string; orderCode?: string }
  | { ok: false; status: number; error: string }

/**
 * Full webhook pipeline for an incoming request: provider signature
 * verification → normalization → state processing.
 */
export async function processWebhookRequest(headers: Headers, rawBody: string): Promise<ProcessResult> {
  const verified = verifyWebhookMultiProvider(headers, rawBody)
  if (!verified.ok || !verified.normalized) {
    return { ok: false, status: verified.status ?? 401, error: verified.error ?? 'Invalid webhook signature' }
  }
  return processNormalizedEvent(verified.normalized, rawBody)
}

/** State machine for a verified event (idempotent by eventId). */
export async function processNormalizedEvent(event: NormalizedPaymentEvent, rawBody: string): Promise<ProcessResult> {
  // 1) duplicate-webhook protection — dedupeKey is unique; replays are no-ops
  const existing = await db.paymentEvent.findUnique({ where: { dedupeKey: event.eventId } })
  if (existing) {
    return { ok: true, outcome: 'duplicate', eventId: event.eventId }
  }

  const payment = await db.payment.findUnique({ where: { providerRef: event.providerRef }, include: { order: true } })
  if (!payment) {
    await db.paymentEvent.create({
      data: {
        provider: event.provider,
        // normalized type — raw provider event name stays in `payload` + audit meta
        eventType: event.type,
        dedupeKey: event.eventId,
        signatureValid: true,
        payload: rawBody,
      },
    })
    return { ok: false, status: 404, error: 'Unknown payment reference' }
  }

  const alreadyPaid = payment.order.paymentStatus === 'PAID'
  await db.paymentEvent.create({
    data: {
      provider: event.provider,
      // normalized type — provider-agnostic invariant checks (R5) depend on it;
      // the provider's own event name stays visible in `payload` + audit meta
      eventType: event.type,
      dedupeKey: event.eventId,
      signatureValid: true,
      payload: rawBody,
      paymentId: payment.id,
      processedAt: new Date(),
    },
  })

  if (event.type === 'refund.processed') {
    // informational confirmation that a refund we initiated reached the
    // gateway — money state is already reflected by the cancellation flow
    await audit({
      actorRole: 'GATEWAY',
      actorRef: event.provider,
      action: 'REFUND_PROCESSED',
      entityType: 'Payment',
      entityId: payment.id,
      orderId: payment.orderId,
      mallId: payment.order.mallId,
      meta: { refundId: event.refundId, amountPaise: event.refundAmountPaise, gatewayPaymentId: event.providerRef, provider: event.provider },
    })
    await emitToRooms({ rooms: [`order:${payment.order.code}`], event: 'order:update', data: { code: payment.order.code, refundProcessed: true } })
    return { ok: true, outcome: 'refund_processed', eventId: event.eventId, orderCode: payment.order.code }
  }

  if (event.type === 'payment.captured') {
    if (alreadyPaid) return { ok: true, outcome: 'already_paid', eventId: event.eventId, orderCode: payment.order.code }

    // REAL gateway adoption: Razorpay owns the payment id namespace (pay_…).
    // Once verified, the event's gateway payment id REPLACES our internal
    // session ref on the Payment row — refunds + future events address the
    // payment the way the gateway does. (The event was matched through the
    // order receipt/notes, so this update cannot misfire onto another row.)
    const isGatewayId = event.providerRef !== payment.providerRef && event.providerRef.length > 0
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESS',
        method: event.method ?? payment.method,
        methodDetail: event.methodDetail ?? payment.methodDetail,
        failureReason: null,
        ...(event.provider === 'RAZORPAY' && isGatewayId ? { providerRef: event.providerRef } : {}),
      },
    })
    await db.order.update({ where: { id: payment.orderId }, data: { status: 'PAID', paymentStatus: 'PAID' } })

    const tickets = await db.storeTicket.findMany({ where: { orderId: payment.orderId }, include: { store: true } })

    await audit({
      actorRole: 'GATEWAY',
      actorRef: event.provider,
      action: 'PAYMENT_CAPTURED',
      entityType: 'Payment',
      entityId: payment.id,
      orderId: payment.orderId,
      mallId: payment.order.mallId,
      meta: { providerRef: payment.providerRef, amountPaise: payment.amountPaise, method: event.method, provider: event.provider, rawType: event.rawType },
    })

    // fanout: customer room, each store room, mall-scoped admin room
    await emitToRooms({ rooms: [`order:${payment.order.code}`], event: 'order:paid', data: { code: payment.order.code } })
    for (const t of tickets) {
      await emitToRooms({
        rooms: [`store:${t.storeId}`, `admin:${payment.order.mallId}`],
        event: 'ticket:new',
        data: { ticketId: t.id, orderCode: payment.order.code, storeName: t.store.name },
      })
    }
    return { ok: true, outcome: 'captured', eventId: event.eventId, orderCode: payment.order.code }
  }

  if (event.type === 'payment.failed') {
    // Audit fix #3: a failure event arriving AFTER the money was captured must
    // NEVER flip the order back to FAILED (it used to corrupt PAID orders).
    if (alreadyPaid || payment.status === 'SUCCESS') {
      return { ok: true, outcome: 'already_paid', eventId: event.eventId, orderCode: payment.order.code }
    }
    await db.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failureReason: event.failureReason ?? 'Payment declined by bank' },
    })
    await db.order.update({ where: { id: payment.orderId }, data: { paymentStatus: 'FAILED' } })
    await audit({
      actorRole: 'GATEWAY',
      actorRef: event.provider,
      action: 'PAYMENT_FAILED',
      entityType: 'Payment',
      entityId: payment.id,
      orderId: payment.orderId,
      mallId: payment.order.mallId,
      meta: { providerRef: payment.providerRef, reason: event.failureReason, provider: event.provider },
    })
    await emitToRooms({ rooms: [`order:${payment.order.code}`], event: 'order:update', data: { code: payment.order.code, paymentStatus: 'FAILED' } })
    return { ok: true, outcome: 'failed', eventId: event.eventId, orderCode: payment.order.code }
  }

  return { ok: false, status: 422, error: `Unsupported event type: ${event.rawType}` }
}
