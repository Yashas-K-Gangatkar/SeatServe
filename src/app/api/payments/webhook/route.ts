// POST /api/payments/webhook — the signed payment callback receiver.
// Phase 3: multi-provider. The verifier that validates the signature claims
// the event: SANDBOX_MOCK (X-SeatServe-Signature), RAZORPAY (X-Razorpay-Signature,
// hex HMAC-SHA256 of the raw body) or CASHFREE (x-webhook-signature, base64
// HMAC-SHA256 of timestamp+body). State processing is provider-agnostic.

import { processWebhookRequest } from '@/lib/payment-webhook'
import { fail, ok } from '@/lib/api-helpers'

export async function POST(request: Request) {
  const raw = await request.text()
  const result = await processWebhookRequest(request.headers, raw)
  if (!result.ok) return fail(result.error, result.status)

  return ok(result)
}
