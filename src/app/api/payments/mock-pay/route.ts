// POST /api/payments/mock-pay — SANDBOX ONLY fake gateway.
// Simulates the full gateway loop end-to-end: it builds a provider event, signs it
// with the shared HMAC secret, and calls the public webhook endpoint the way a real
// gateway (Razorpay/Cashfree) would. No real money, no real credentials, nothing stored
// beyond a masked detail string (e.g. "priya@okhdfc" / "•••• 4242") for display.
//
// Idempotency: the client sends an idempotencyKey (UUID) per payment ATTEMPT.
// Retrying with the same key returns the original result — never a double charge.

import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { isPaymentMethod } from '@/lib/types'
import { generatePaymentRef, generateEventId } from '@/lib/ids'
import { signPayload, webhookSecret } from '@/lib/webhook-sig'
import { processWebhookEvent } from '@/lib/payment-webhook'

const bodySchema = z.object({
  orderCode: z.string().min(4),
  method: z.string().refine(isPaymentMethod, 'method must be UPI, CARD or NETBANKING'),
  methodDetail: z.string().max(60).optional(), // masked detail for display, secrets are NEVER accepted/stored
  outcome: z.enum(['success', 'failure']).default('success'),
  failureReason: z.string().max(120).optional(),
  idempotencyKey: z.string().min(8).max(64),
})

export async function POST(request: Request) {
  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error
  const { orderCode, method, methodDetail, outcome, failureReason, idempotencyKey } = parsed.data

  // idempotency gate
  const existing = await db.payment.findUnique({
    where: { idempotencyKey },
    include: { order: { select: { code: true, paymentStatus: true, status: true } } },
  })
  if (existing) {
    return ok({
      idempotent: true,
      providerRef: existing.providerRef,
      paymentStatus: existing.status,
      orderPaymentStatus: existing.order.paymentStatus,
      orderStatus: existing.order.status,
    })
  }

  const order = await db.order.findUnique({
    where: { code: orderCode.toUpperCase() },
    include: { payments: true },
  })
  if (!order) return fail('Order not found', 404)
  if (order.paymentStatus === 'PAID') return fail('This order is already paid', 409)
  if (order.status === 'CANCELLED') return fail('This order was cancelled', 409)

  // Audit fix #4/#9: a crashed gateway attempt left the INITIATED payment row
  // forever — every later retry got 409 "attempt already in progress" and the
  // order was deadlocked. Attempts older than 10 minutes are expired first.
  await db.payment.updateMany({
    where: { orderId: order.id, status: 'INITIATED', createdAt: { lt: new Date(Date.now() - 10 * 60_000) } },
    data: { status: 'FAILED', failureReason: 'Expired — payment attempt abandoned after 10 minutes' },
  })

  // Audit fix #23: two concurrent submits with different idempotency keys both
  // passed the active-attempt check and created TWO payments. The check and
  // the create now run inside one serialized transaction (SQLite writes are
  // serialized inside a transaction).
  const providerRef = generatePaymentRef()
  const created = await db.$transaction(async (tx) => {
    const active = await tx.payment.findFirst({ where: { orderId: order.id, status: 'INITIATED' } })
    if (active) return null
    return tx.payment.create({
      data: {
        orderId: order.id,
        provider: 'SANDBOX_MOCK',
        method,
        amountPaise: order.totalPaise,
        status: 'INITIATED',
        providerRef,
        idempotencyKey,
        methodDetail: methodDetail ?? null,
      },
    })
  })
  if (!created) return fail('A payment attempt is already in progress for this order', 409)

  // ── gateway simulation ────────────────────────────────────────────
  // The "gateway" builds the event, signs it, and POSTs it to our webhook.
  const event = {
    eventId: generateEventId(),
    type: outcome === 'success' ? ('payment.captured' as const) : ('payment.failed' as const),
    provider: 'SANDBOX_MOCK',
    providerRef,
    method,
    methodDetail: methodDetail ?? null,
    failureReason: outcome === 'failure' ? (failureReason ?? 'Insufficient balance') : undefined,
  }
  const raw = JSON.stringify(event)
  const signature = signPayload(raw, webhookSecret())

  let result: Awaited<ReturnType<typeof processWebhookEvent>>
  try {
    // call ourselves exactly like an external gateway would (same endpoint, same header)
    const base = process.env.INTERNAL_BASE_URL ?? 'http://localhost:3000'
    const webhookResponse = await fetch(`${base}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-SeatServe-Signature': signature },
      body: raw,
      // webhook must be fast; do not wait forever
      signal: AbortSignal.timeout(5000),
    })
    const json = (await webhookResponse.json()) as { ok: boolean; data?: unknown; error?: string }
    if (json.ok && json.data) {
      result = json.data as Awaited<ReturnType<typeof processWebhookEvent>>
    } else {
      result = { ok: false, status: webhookResponse.status, error: json.error ?? 'webhook error' }
    }
  } catch {
    // network hiccup during self-call: process locally with the SAME verified path
    result = await processWebhookEvent(raw, signature)
  }

  if (!result.ok) return fail(`Webhook rejected: ${result.error}`, result.status)

  const payment = await db.payment.findUnique({ where: { providerRef }, include: { order: { select: { code: true, paymentStatus: true, status: true } } } })
  return ok({
    idempotent: false,
    providerRef,
    eventId: result.eventId,
    outcome: result.outcome,
    paymentStatus: payment?.status ?? 'INITIATED',
    orderPaymentStatus: payment?.order.paymentStatus ?? 'PENDING',
    orderStatus: payment?.order.status ?? 'PENDING_PAYMENT',
    orderCode: payment?.order.code ?? order.code,
  })
}
