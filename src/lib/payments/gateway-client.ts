// SeatServe Phase 3 — REAL gateway rails (Razorpay Route · Cashfree Easy Split).
//
// Everything here is env-activated: with no credentials configured the platform
// runs the SANDBOX_MOCK gateway (mock-pay + signed local webhooks). The moment
// RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET or CASHFREE_APP_ID/CASHFREE_SECRET_KEY
// are set (test/sandbox keys first!), these clients hit the REAL sandbox APIs —
// order creation and split instructions (no refund rails — cinema policy: no online refunds) — using the exact
// request shapes the providers document.
//
// SECURITY: secret keys NEVER reach the client. The checkout session endpoint
// returns only what a gateway's client SDK needs (order id, amount, key id).
// Webhooks remain the single source of truth for money state (signed events).

import { razorpayTransfers, cashfreeSplits, type SplitInstructionInput } from './provider'

// ───────────────────────── configuration ─────────────────────────

export type ActiveGateway = 'SANDBOX_MOCK' | 'RAZORPAY' | 'CASHFREE'

export function activeGateway(): ActiveGateway {
  // case/format tolerant — "razorpay", " Razorpay " and "RAZORPAY" all work;
  // a silent SANDBOX_MOCK fallback on a formatting mistake would be a money bug
  const configured = process.env.PAYMENT_PROVIDER?.trim().toUpperCase()
  if (configured === 'RAZORPAY' && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) return 'RAZORPAY'
  if (configured === 'CASHFREE' && process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY) return 'CASHFREE'
  return 'SANDBOX_MOCK'
}

interface GatewayCreds {
  baseUrl: string
  authHeaders: Record<string, string>
}

function razorpayCreds(): GatewayCreds {
  const id = process.env.RAZORPAY_KEY_ID!
  const secret = process.env.RAZORPAY_KEY_SECRET!
  // Sandbox/test keys hit api.razorpay.com exactly like live keys — the key
  // prefix (rzp_test_ / rzp_live_) decides the environment.
  return {
    baseUrl: 'https://api.razorpay.com/v1',
    authHeaders: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}` },
  }
}

function cashfreeCreds(): GatewayCreds {
  const appId = process.env.CASHFREE_APP_ID!
  const secret = process.env.CASHFREE_SECRET_KEY!
  const apiVersion = process.env.CASHFREE_API_VERSION ?? '2023-08-01'
  // CASHFREE_ENV=sandbox (default) → test sandbox; "production" → live
  const env = (process.env.CASHFREE_ENV ?? 'sandbox').toLowerCase()
  return {
    baseUrl: env === 'production' ? 'https://api.cashfree.com' : 'https://sandbox.cashfree.com',
    authHeaders: { 'x-client-id': appId, 'x-client-secret': secret, 'x-api-version': apiVersion },
  }
}

async function gatewayJson(creds: GatewayCreds, path: string, method: 'POST' | 'GET', body?: unknown): Promise<{ ok: boolean; status: number; data?: unknown; error?: string }> {
  try {
    const res = await fetch(`${creds.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...creds.authHeaders },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
    const text = await res.text()
    const data = text ? (JSON.parse(text) as unknown) : undefined
    if (!res.ok) {
      const message =
        (data as { error?: { description?: string } } | undefined)?.error?.description ??
        (data as { message?: string } | undefined)?.message ??
        `Gateway returned ${res.status}`
      return { ok: false, status: res.status, error: message }
    }
    return { ok: true, status: res.status, data }
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : 'gateway request failed' }
  }
}

// ───────────────── Razorpay Route — orders + transfers ─────────────────

export interface RazorpayOrderResult {
  gatewayOrderId: string
  amountPaise: number
  keyId: string
  transfers: ReturnType<typeof razorpayTransfers>
}

/**
 * Creates a Razorpay Order with Route transfers attached — per-store linked
 * accounts are paid automatically at capture time. Docs: Razorpay Route
 * "Create an order with transfers" (transfers[].account = linked account id).
 */
export async function createRazorpayOrder(input: SplitInstructionInput & { receipt: string }): Promise<RazorpayOrderResult> {
  const creds = razorpayCreds()
  // Route transfers attach ONLY for stores whose linked account is actually
  // configured (RAZORPAY_ACCOUNT_<SLUG>). Without it the whole payment
  // settles to the platform's main account and the Split ledger + settlement
  // batches handle store payouts — the provider must never see a made-up
  // account id like acct_<slug> (it rejects the whole order).
  const transfers = razorpayTransfers(input).filter(
    (t, i) => input.storeLegs[i] && process.env[`RAZORPAY_ACCOUNT_${input.storeLegs[i].storeSlug.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`],
  )
  const res = await gatewayJson(creds, '/orders', 'POST', {
    amount: input.amountPaise,
    currency: 'INR',
    receipt: input.receipt,
    // notes ride along on every webhook event's payment entity — the webhook
    // resolves our Payment row from receipt/notes even though Razorpay owns
    // the payment id namespace
    notes: { seatserve_order: input.receipt },
    ...(transfers.length > 0 ? { transfers } : {}),
  })
  if (!res.ok) throw new Error(`Razorpay order creation failed: ${res.error}`)
  const order = res.data as { id: string; amount: number }
  return { gatewayOrderId: order.id, amountPaise: order.amount, keyId: process.env.RAZORPAY_KEY_ID!, transfers }
}

// ───────────────── Cashfree Easy Split — orders + splits ─────────────────

export interface CashfreeOrderResult {
  gatewayOrderId: string
  paymentSessionId: string
  splits: ReturnType<typeof cashfreeSplits>['splits']
  platformAmount: number
}

/**
 * Creates a Cashfree order with Easy Split vendor splits. Docs: Cashfree
 * Payments "Create Order" (order_splits with vendor_id/amount, percentage or
 * flat amounts; remainder stays with the platform merchant).
 */
export async function createCashfreeOrder(input: SplitInstructionInput & { orderMeta?: Record<string, string> }): Promise<CashfreeOrderResult> {
  const creds = cashfreeCreds()
  const { splits, platform_amount } = cashfreeSplits(input)
  const res = await gatewayJson(creds, '/pg/orders', 'POST', {
    order_id: input.orderCode,
    order_amount: input.amountPaise / 100,
    order_currency: 'INR',
    order_splits: splits.map((s) => ({ vendor_id: s.vendor_id, amount: s.amount / 100 })),
    order_meta: input.orderMeta,
  })
  if (!res.ok) throw new Error(`Cashfree order creation failed: ${res.error}`)
  const order = res.data as { order_id: string; payment_session_id: string }
  return { gatewayOrderId: order.order_id, paymentSessionId: order.payment_session_id, splits, platformAmount: platform_amount }
}

/**
 * Refunds a captured Razorpay payment to the source (UPI/card). Used ONLY by
 * the customer cancel-before-accept window: the order was never made, so the
 * money goes back. paymentId is the REAL gateway payment id (pay_...) — the
 * webhook adopts it onto the Payment row at capture time.
 */
export async function refundRazorpayPayment(input: {
  paymentId: string
  amountPaise: number
  orderCode: string
}): Promise<{ ok: true; refundId: string; status: string } | { ok: false; error: string }> {
  const creds = razorpayCreds()
  const res = await gatewayJson(creds, `/payments/${encodeURIComponent(input.paymentId)}/refund`, 'POST', {
    amount: input.amountPaise,
    speed: 'normal',
    notes: { seatserve_order: input.orderCode, reason: 'cancelled_before_accept' },
  })
  if (!res.ok) return { ok: false, error: res.error ?? 'refund failed' }
  const refund = res.data as { id?: string; status?: string }
  if (!refund?.id) return { ok: false, error: 'Razorpay refund response missing id' }
  return { ok: true, refundId: refund.id, status: refund.status ?? 'pending' }
}

/**
 * Unified checkout-session creation. SANDBOX_MOCK never talks to a gateway —
 * the client falls back to the mock-pay sheet.
 */
export async function createCheckoutSession(input: SplitInstructionInput): Promise<
  | { mode: 'SANDBOX_MOCK' }
  | { mode: 'RAZORPAY'; gatewayOrderId: string; amountPaise: number; keyId: string }
  | { mode: 'CASHFREE'; gatewayOrderId: string; paymentSessionId: string; amountPaise: number }
> {
  const gateway = activeGateway()
  if (gateway === 'RAZORPAY') {
    const r = await createRazorpayOrder({ ...input, receipt: input.orderCode })
    return { mode: 'RAZORPAY', gatewayOrderId: r.gatewayOrderId, amountPaise: r.amountPaise, keyId: r.keyId }
  }
  if (gateway === 'CASHFREE') {
    const c = await createCashfreeOrder(input)
    return { mode: 'CASHFREE', gatewayOrderId: c.gatewayOrderId, paymentSessionId: c.paymentSessionId, amountPaise: input.amountPaise }
  }
  return { mode: 'SANDBOX_MOCK' }
}
