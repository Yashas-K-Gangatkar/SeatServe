// POST /api/payments/session — Phase 3: create a gateway checkout session.
//
// SANDBOX_MOCK (default): returns { mode: 'SANDBOX_MOCK' } and the customer
// app shows the mock payment sheet (POST /api/payments/mock-pay), which drives
// the SAME signed-webhook pipeline a real gateway event follows.
//
// RAZORPAY / CASHFREE (env-configured sandbox keys): creates a REAL gateway
// order on the provider's sandbox with per-store split instructions attached
// (Route transfers / Easy Split vendor splits) and a Payment row (INITIATED)
// whose providerRef the gateway echoes back through the signed webhook.
// Only client-safe fields are returned — secret keys never leave the server.

import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { generatePaymentRef } from '@/lib/ids'
import { activeGateway, createCheckoutSession } from '@/lib/payments/gateway-client'

const bodySchema = z.object({
  orderCode: z.string().min(4).max(24),
})

export async function POST(request: Request) {
  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error
  const gateway = activeGateway()

  const order = await db.order.findUnique({
    where: { code: parsed.data.orderCode.trim().toUpperCase() },
    include: { splits: true },
  })
  if (!order) return fail('Order not found', 404)
  if (order.paymentStatus === 'PAID' || order.paymentStatus === 'PARTIALLY_REFUNDED') {
    return fail('This order is already paid', 409)
  }
  if (order.status === 'CANCELLED') return fail('This order was cancelled', 409)

  if (gateway === 'SANDBOX_MOCK') {
    return ok({ mode: 'SANDBOX_MOCK', orderCode: order.code, amountPaise: order.totalPaise })
  }

  // idempotent-ish: reuse an INITIATED payment for repeat sessions
  let payment = await db.payment.findFirst({
    where: { orderId: order.id, status: 'INITIATED' },
    orderBy: { createdAt: 'desc' },
  })
  if (!payment) {
    payment = await db.payment.create({
      data: {
        orderId: order.id,
        provider: gateway,
        method: 'PENDING',
        amountPaise: order.totalPaise,
        status: 'INITIATED',
        providerRef: generatePaymentRef(),
        idempotencyKey: `session_${order.code}`,
      },
    })
  }

  // per-store split instructions straight from the ledger (STORE rows are
  // ledger-driven: storeNet, commissionPaise set at order creation)
  const storeLegs = order.splits
    .filter((s) => s.beneficiary === 'STORE' && s.storeId && s.amountPaise > 0)
    .map((s) => ({ storeId: s.storeId!, storeSlug: s.storeId!, amountPaise: s.amountPaise, commissionPaise: s.commissionPaise }))

  // resolve slugs (linkedAccountFor / vendorIdFor key off slugs)
  const storeIds = storeLegs.map((l) => l.storeId)
  const stores = await db.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, slug: true } })
  for (const leg of storeLegs) {
    leg.storeSlug = stores.find((s) => s.id === leg.storeId)?.slug ?? leg.storeId
  }

  try {
    const session = await createCheckoutSession({
      // the gateway-visible order id carries our providerRef (webhook contract)
      orderCode: `${order.code}|${payment.providerRef}`,
      amountPaise: order.totalPaise,
      storeLegs,
    })
    return ok({ ...session, orderCode: order.code })
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Could not create checkout session', 502)
  }
}
