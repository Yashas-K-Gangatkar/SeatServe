// SeatServe Phase 3 — payment provider abstraction.
//
// One public webhook endpoint (/api/payments/webhook) accepts events from ANY
// configured provider: the verifier that validates the signature claims the
// event, and the event is normalized into SeatServe's internal shape before
// state processing. Money state transitions never see provider specifics.
//
// Sandbox: SANDBOX_MOCK is always configured (no credentials needed).
// Production: set PAYMENT_PROVIDER=RAZORPAY|CASHFREE + the provider's
// credentials/webhook secrets — adapters below implement the REAL signature
// schemes; only HTTP calls to the gateway itself (checkout session creation,
// real-gateway order creation) remain Phase 4 deployment work. Online refunds do not exist by policy.

import { verifySignature, webhookSecret } from '@/lib/webhook-sig'

export type ProviderId = 'SANDBOX_MOCK' | 'RAZORPAY' | 'CASHFREE'

/** SeatServe-normalized webhook event — all providers map to this. */
export interface NormalizedPaymentEvent {
  eventId: string
  type: 'payment.captured' | 'payment.failed' | 'refund.processed'
  provider: ProviderId
  /** our Payment.providerRef — adapters resolve gateway ids onto it */
  providerRef: string
  method?: string
  methodDetail?: string
  failureReason?: string
  /** refund.processed: gateway refund id + amount, for the audit trail */
  refundId?: string
  refundAmountPaise?: number
  /** raw provider event type, for the audit trail */
  rawType: string
}

export interface WebhookVerifyResult {
  ok: boolean
  /** 401 signature / 400 body / 422 shape problems */
  status?: number
  error?: string
  normalized?: NormalizedPaymentEvent
}

export interface PaymentProviderAdapter {
  id: ProviderId
  /** header names this provider signs with (fast pre-filter) */
  signatureHeaders: string[]
  /** verify signature + parse + normalize; MUST NOT touch the database */
  verifyAndNormalize(headers: Headers, rawBody: string): WebhookVerifyResult
}

// ───────────────────────── shared crypto helpers ─────────────────────────

function hmac(secret: string, body: string): import('node:crypto').Hmac {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHmac } = require('node:crypto') as typeof import('node:crypto')
  return createHmac('sha256', secret)
}

/** Razorpay scheme: hex HMAC-SHA256(secret, rawBody). */
export function razorpaySignature(secret: string, rawBody: string): string {
  return hmac(secret, rawBody).update(rawBody).digest('hex')
}

/** Razorpay verification must be timing-safe. */
export function razorpayVerify(secret: string, rawBody: string, signature: string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { timingSafeEqual } = require('node:crypto') as typeof import('node:crypto')
  const expected = razorpaySignature(secret, rawBody)
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))
  } catch {
    return false
  }
}

/** Cashfree scheme (v2023-08+): base64 HMAC-SHA256(secret, `${timestamp}${rawBody}`). */
export function cashfreeSignature(secret: string, timestamp: string, rawBody: string): string {
  return hmac(secret, rawBody).update(`${timestamp}${rawBody}`).digest('base64')
}

export function cashfreeVerify(secret: string, timestamp: string, rawBody: string, signature: string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { timingSafeEqual } = require('node:crypto') as typeof import('node:crypto')
  const expected = cashfreeSignature(secret, timestamp, rawBody)
  try {
    return timingSafeEqual(Buffer.from(expected, 'base64'), Buffer.from(signature, 'base64'))
  } catch {
    return false
  }
}

// ───────────────────────── split instructions ─────────────────────────
// Builders that demonstrate EXACTLY what SeatServe would hand Razorpay Route
// (transfers to linked accounts) and Cashfree Easy Split (vendor splits) at
// capture time — derived from the order's own Split ledger. The sandbox uses
// them for the settlement report; production calls them when creating the
// gateway order.

export interface SplitInstructionInput {
  orderCode: string
  amountPaise: number
  storeLegs: { storeId: string; storeSlug: string; amountPaise: number; commissionPaise: number }[]
}

export function linkedAccountFor(storeSlug: string): string {
  return process.env[`RAZORPAY_ACCOUNT_${storeSlug.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`] ?? `acct_${storeSlug}`
}

export function vendorIdFor(storeSlug: string): string {
  return process.env[`CASHFREE_VENDOR_${storeSlug.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`] ?? `vend_${storeSlug}`
}

/** Razorpay Route: per-store transfers executed at payment capture. */
export function razorpayTransfers(input: SplitInstructionInput) {
  return input.storeLegs.map((leg) => ({
    account: linkedAccountFor(leg.storeSlug),
    amount: leg.amountPaise, // store net (subtotal − tax − commission)
    currency: 'INR',
    notes: { seatserve_order: input.orderCode, store_id: leg.storeId },
  }))
}

/** Cashfree Easy Split: vendor splits + platform share on the order. */
export function cashfreeSplits(input: SplitInstructionInput) {
  const splits = input.storeLegs.map((leg) => ({
    vendor_id: vendorIdFor(leg.storeSlug),
    amount: leg.amountPaise,
  }))
  const platform_amount = Math.max(0, input.amountPaise - splits.reduce((s, l) => s + l.amount, 0))
  return { splits, platform_amount }
}

// ───────────────────────── adapters ─────────────────────────

const mockAdapter: PaymentProviderAdapter = {
  id: 'SANDBOX_MOCK',
  signatureHeaders: ['x-seatserve-signature'],
  verifyAndNormalize(headers, rawBody) {
    const signature = headers.get('x-seatserve-signature') ?? ''
    if (!verifySignature(rawBody, signature, webhookSecret())) {
      return { ok: false, status: 401, error: 'Invalid webhook signature' }
    }
    let event: {
      eventId?: string
      type?: string
      provider?: string
      providerRef?: string
      method?: string
      methodDetail?: string
      failureReason?: string
    }
    try {
      event = JSON.parse(rawBody)
    } catch {
      return { ok: false, status: 400, error: 'Webhook body is not valid JSON' }
    }
    if (!event.eventId || !event.type || !event.providerRef) {
      return { ok: false, status: 422, error: 'Webhook missing eventId/type/providerRef' }
    }
    if (event.type !== 'payment.captured' && event.type !== 'payment.failed') {
      return { ok: false, status: 422, error: `Unsupported event type: ${event.type}` }
    }
    return {
      ok: true,
      normalized: {
        eventId: event.eventId,
        type: event.type,
        provider: 'SANDBOX_MOCK',
        providerRef: event.providerRef,
        method: event.method,
        methodDetail: event.methodDetail,
        failureReason: event.failureReason,
        rawType: event.type,
      },
    }
  },
}

/** Razorpay Route adapter — X-Razorpay-Signature: hex HMAC-SHA256(secret, rawBody). */
const razorpayAdapter: PaymentProviderAdapter = {
  id: 'RAZORPAY',
  signatureHeaders: ['x-razorpay-signature'],
  verifyAndNormalize(headers, rawBody) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET
    if (!secret) return { ok: false, status: 503, error: 'RAZORPAY_WEBHOOK_SECRET not configured' }
    const signature = headers.get('x-razorpay-signature') ?? ''
    if (!razorpayVerify(secret, rawBody, signature)) {
      return { ok: false, status: 401, error: 'Invalid webhook signature' }
    }
    // Razorpay payload: { event, payload: { payment: { entity }, order?: { entity }, refund?: { entity } } }
    let body: {
      event?: string
      payload?: {
        payment?: { entity?: { id?: string; method?: string; vpa?: string; card?: { last4?: string }; error_description?: string; notes?: Record<string, string> } }
        order?: { entity?: { id?: string; receipt?: string } }
        refund?: { entity?: { id?: string; payment_id?: string; amount?: number } }
      }
    }
    try {
      body = JSON.parse(rawBody)
    } catch {
      return { ok: false, status: 400, error: 'Webhook body is not valid JSON' }
    }
    const entity = body.payload?.payment?.entity
    if (!body.event) return { ok: false, status: 422, error: 'Razorpay event missing event' }

    // refund.processed carries payload.refund.entity (payment_id links back);
    // there may be no payment entity on the event (refund webhooks include it
    // under payload.payment too — accept either shape)
    if (body.event === 'refund.processed') {
      const refund = body.payload?.refund?.entity
      const paymentId = refund?.payment_id ?? entity?.id
      if (!refund?.id || !paymentId) {
        return { ok: false, status: 422, error: 'Razorpay refund event missing refund.id/payment_id' }
      }
      return {
        ok: true,
        normalized: {
          eventId: `rzp_${refund.id}_refund.processed`,
          type: 'refund.processed',
          provider: 'RAZORPAY',
          providerRef: paymentId,
          refundId: refund.id,
          refundAmountPaise: refund.amount,
          rawType: body.event,
        },
      }
    }

    if (!entity?.id) return { ok: false, status: 422, error: 'Razorpay event missing payload.payment.entity.id' }
    if (body.event !== 'payment.captured' && body.event !== 'payment.failed') {
      return { ok: false, status: 422, error: `Unsupported Razorpay event: ${body.event}` }
    }

    // REAL gateway contract: our Payment.providerRef travels inside the order's
    // receipt ("SS-XXXX|<providerRef>") and the order notes — Razorpay echoes
    // both back on every payment event. The sandbox contract (pay_<providerRef>
    // as the payment id) stays as a legacy fallback. The captured event's REAL
    // pay_ id is adopted onto the Payment row by the state processor.
    const fromReceipt = body.payload?.order?.entity?.receipt ?? entity.notes?.seatserve_order ?? ''
    const pipe = fromReceipt.indexOf('|')
    const providerRef = pipe >= 0 ? fromReceipt.slice(pipe + 1) : entity.id.startsWith('pay_') ? entity.id.slice(4) : entity.id
    return {
      ok: true,
      normalized: {
        eventId: `rzp_${entity.id}_${body.event}`,
        type: body.event,
        provider: 'RAZORPAY',
        providerRef,
        method: entity.method,
        methodDetail: entity.vpa ?? (entity.card?.last4 ? `•••• ${entity.card.last4}` : undefined),
        failureReason: entity.error_description,
        rawType: body.event,
      },
    }
  },
}

/** Cashfree Easy Split adapter — x-webhook-signature: base64 HMAC-SHA256(secret, ts+body). */
const cashfreeAdapter: PaymentProviderAdapter = {
  id: 'CASHFREE',
  signatureHeaders: ['x-webhook-signature'],
  verifyAndNormalize(headers, rawBody) {
    const secret = process.env.CASHFREE_WEBHOOK_SECRET
    if (!secret) return { ok: false, status: 503, error: 'CASHFREE_WEBHOOK_SECRET not configured' }
    const timestamp = headers.get('x-webhook-timestamp') ?? ''
    const signature = headers.get('x-webhook-signature') ?? ''
    if (!timestamp || !cashfreeVerify(secret, timestamp, rawBody, signature)) {
      return { ok: false, status: 401, error: 'Invalid webhook signature' }
    }
    // Cashfree payload: { type, data: { order: { order_id }, payment: { cf_payment_id, payment_method, ... } } }
    let body: {
      type?: string
      data?: {
        order?: { order_id?: string }
        payment?: { cf_payment_id?: string | number; payment_method?: string; upi?: { vpa?: string }; error_details?: { error_description?: string } }
      }
    }
    try {
      body = JSON.parse(rawBody)
    } catch {
      return { ok: false, status: 400, error: 'Webhook body is not valid JSON' }
    }
    const orderId = body.data?.order?.order_id
    const paymentId = body.data?.payment?.cf_payment_id
    if (!body.type || !orderId || paymentId === undefined) {
      return { ok: false, status: 422, error: 'Cashfree event missing type/data.order.order_id/data.payment.cf_payment_id' }
    }
    // Sandbox contract: order_id = "SS-XXXX|<providerRef>" — the pipe keeps our
    // Payment.providerRef addressable while carrying the gateway-visible order id.
    const pipe = orderId.indexOf('|')
    const providerRef = pipe >= 0 ? orderId.slice(pipe + 1) : orderId
    if (body.type !== 'PAYMENT_SUCCESS' && body.type !== 'PAYMENT_FAILED') {
      return { ok: false, status: 422, error: `Unsupported Cashfree event: ${body.type}` }
    }
    return {
      ok: true,
      normalized: {
        eventId: `cf_${paymentId}_${body.type}`,
        type: body.type === 'PAYMENT_SUCCESS' ? 'payment.captured' : 'payment.failed',
        provider: 'CASHFREE',
        providerRef,
        method: body.data?.payment?.payment_method,
        methodDetail: body.data?.payment?.upi?.vpa,
        failureReason: body.data?.payment?.error_details?.error_description,
        rawType: body.type,
      },
    }
  },
}

/** All adapters, in claim order. Sandbox mock is ALWAYS last-resort enabled. */
export function providerAdapters(): PaymentProviderAdapter[] {
  const adapters: PaymentProviderAdapter[] = []
  if (process.env.RAZORPAY_WEBHOOK_SECRET) adapters.push(razorpayAdapter)
  if (process.env.CASHFREE_WEBHOOK_SECRET) adapters.push(cashfreeAdapter)
  adapters.push(mockAdapter) // sandbox fallback — must stay LAST
  return adapters
}

/**
 * Verify against every configured provider: the one whose signature validates
 * claims the event. Multi-gateway safe (a RAZORPAY-signed event can never be
 * processed as SANDBOX_MOCK: signatures bind the secret + body).
 */
export function verifyWebhookMultiProvider(headers: Headers, rawBody: string): WebhookVerifyResult & { adapterId?: ProviderId } {
  let bestError: WebhookVerifyResult = { ok: false, status: 401, error: 'Invalid webhook signature' }
  for (const adapter of providerAdapters()) {
    const result = adapter.verifyAndNormalize(headers, rawBody)
    if (result.ok) return { ...result, adapterId: adapter.id }
    // keep the most informative error (signature errors from configured providers win)
    if (result.status !== 503) bestError = result
  }
  return bestError
}

export const activeProviderId = (): ProviderId => {
  const configured = process.env.PAYMENT_PROVIDER?.trim().toUpperCase()
  if (configured === 'RAZORPAY' || configured === 'CASHFREE') return configured
  return 'SANDBOX_MOCK'
}
