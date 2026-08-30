// POST /api/payments/webhook — the signed payment callback receiver.
// Phase 1: the sandbox gateway signs with the shared secret (HMAC-SHA256 over raw body).
// Phase 3: swap the verifier config to Razorpay/Cashfree — the surrounding
// dedupe/idempotency/state logic stays identical.

import { processWebhookEvent } from '@/lib/payment-webhook'
import { fail, ok } from '@/lib/api-helpers'

export async function POST(request: Request) {
  const raw = await request.text()
  // HTTP header lookup is case-insensitive; canonical name: X-SeatServe-Signature
  const signature = request.headers.get('x-seatserve-signature') ?? ''

  const result = await processWebhookEvent(raw, signature)
  if (!result.ok) return fail(result.error, result.status)

  return ok(result)
}
