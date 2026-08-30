// SeatServe — payment webhook signing & verification (pure crypto).
// Phase 1: the sandbox mock gateway signs its callbacks exactly the way a real
// gateway (Razorpay X-Signature / Cashfree x-webhook-signature) does — HMAC-SHA256
// over the raw body with a shared secret. Receivers MUST verify before trusting.

import { createHmac, timingSafeEqual } from 'node:crypto'

export function signPayload(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex')
}

export function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = signPayload(rawBody, secret)
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature ?? '', 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function webhookSecret(): string {
  return process.env.PAYMENT_WEBHOOK_SECRET ?? 'sandbox_webhook_secret_dev_only'
}
