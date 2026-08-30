// SeatServe — payment webhook processing (shared by the real webhook route and
// the sandbox gateway loop). Signature verification + duplicate-event protection
// + state transitions + realtime fanout. This is Phase 3's exact production shape;
// only the provider changes (SANDBOX_MOCK → RAZORPAY/CASHFREE).

import { db } from '@/lib/db'
import { verifySignature, webhookSecret } from '@/lib/webhook-sig'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'

export interface WebhookEventShape {
  eventId: string
  type: 'payment.captured' | 'payment.failed'
  provider: string
  providerRef: string
  method?: string
  methodDetail?: string
  failureReason?: string
}

export type ProcessResult =
  | { ok: true; outcome: 'captured' | 'failed' | 'duplicate' | 'already_paid'; eventId: string; orderCode?: string }
  | { ok: false; status: number; error: string }

export async function processWebhookEvent(rawBody: string, signature: string): Promise<ProcessResult> {
  // 1) authenticate the caller — never trust the payload without a valid signature
  if (!verifySignature(rawBody, signature, webhookSecret())) {
    return { ok: false, status: 401, error: 'Invalid webhook signature' }
  }

  // 2) parse
  let event: WebhookEventShape
  try {
    event = JSON.parse(rawBody) as WebhookEventShape
  } catch {
    return { ok: false, status: 400, error: 'Webhook body is not valid JSON' }
  }
  if (!event.eventId || !event.type || !event.providerRef) {
    return { ok: false, status: 422, error: 'Webhook missing eventId/type/providerRef' }
  }

  // 3) duplicate-webhook protection — dedupeKey is unique; replays are no-ops
  const existing = await db.paymentEvent.findUnique({ where: { dedupeKey: event.eventId } })
  if (existing) {
    return { ok: true, outcome: 'duplicate', eventId: event.eventId }
  }

  const payment = await db.payment.findUnique({ where: { providerRef: event.providerRef }, include: { order: true } })
  if (!payment) {
    await db.paymentEvent.create({
      data: {
        provider: event.provider ?? 'UNKNOWN',
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
      eventType: event.type,
      dedupeKey: event.eventId,
      signatureValid: true,
      payload: rawBody,
      paymentId: payment.id,
      processedAt: new Date(),
    },
  })

  if (event.type === 'payment.captured') {
    if (alreadyPaid) return { ok: true, outcome: 'already_paid', eventId: event.eventId, orderCode: payment.order.code }

    await db.payment.update({
      where: { id: payment.id },
      data: { status: 'SUCCESS', method: event.method ?? payment.method, methodDetail: event.methodDetail ?? payment.methodDetail, failureReason: null },
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
      meta: { providerRef: payment.providerRef, amountPaise: payment.amountPaise, method: event.method },
    })

    // fanout: customer room, each store room, admin
    await emitToRooms({ rooms: [`order:${payment.order.code}`], event: 'order:paid', data: { code: payment.order.code } })
    for (const t of tickets) {
      await emitToRooms({
        rooms: [`store:${t.storeId}`, 'admin'],
        event: 'ticket:new',
        data: { ticketId: t.id, orderCode: payment.order.code, storeName: t.store.name },
      })
    }
    return { ok: true, outcome: 'captured', eventId: event.eventId, orderCode: payment.order.code }
  }

  if (event.type === 'payment.failed') {
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
      meta: { providerRef: payment.providerRef, reason: event.failureReason },
    })
    await emitToRooms({ rooms: [`order:${payment.order.code}`], event: 'order:update', data: { code: payment.order.code, paymentStatus: 'FAILED' } })
    return { ok: true, outcome: 'failed', eventId: event.eventId, orderCode: payment.order.code }
  }

  return { ok: false, status: 422, error: `Unsupported event type: ${event.type}` }
}
