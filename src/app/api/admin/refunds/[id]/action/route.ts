// POST /api/admin/refunds/[id]/action — finance desk actioning (MALL_ADMIN).
// Audit fixes #2/#43: refund requests dead-ended in REQUESTED forever — there
// was no API (and no UI) to approve/reject/process them, so money never moved.
// Actions:
//   APPROVE  REQUESTED → APPROVED
//   REJECT   REQUESTED|APPROVED → REJECTED
//   PROCESS  APPROVED|REQUESTED → PROCESSED: writes negative REFUNDED split
//            rows (exact Σ, proportional across the order's ledger), bumps
//            Order.refundedPaise and flips paymentStatus
//            PARTIALLY_REFUNDED → REFUNDED when fully refunded.
//            With a REAL gateway configured (Razorpay/Cashfree sandbox keys),
//            the refund is FIRST submitted to the gateway — ledger rows are
//            only written when the gateway accepts it.
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'
import { applyRefundToLedger } from '@/lib/refunds'
import { activeGateway, submitRazorpayRefund, submitCashfreeRefund } from '@/lib/payments/gateway-client'

const bodySchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'PROCESS']),
  amountPaise: z.number().int().min(1).optional(), // PROCESS override, clamped server-side
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireStaff(request, ['MALL_ADMIN'])
  if ('error' in auth) return auth.error
  const user = auth.user

  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error

  const refund = await db.refund.findUnique({ where: { id }, include: { order: true } })
  if (!refund) return fail('Refund not found', 404)

  // tenant scope: only refunds of orders inside the admin's mall
  if (refund.order.mallId !== (user.mallId ?? '__none__')) {
    return fail('This refund belongs to another mall', 403)
  }
  if (refund.order.paymentStatus === 'PENDING' || refund.order.paymentStatus === 'FAILED') {
    return fail('This order has no captured payment to refund', 409)
  }

  const { action } = parsed.data
  if (action === 'APPROVE') {
    if (refund.status !== 'REQUESTED') return fail(`Cannot approve a ${refund.status} refund`, 409)
    await db.refund.update({ where: { id }, data: { status: 'APPROVED' } })
  } else if (action === 'REJECT') {
    if (refund.status === 'PROCESSED' || refund.status === 'REJECTED') return fail(`Cannot reject a ${refund.status} refund`, 409)
    await db.refund.update({ where: { id }, data: { status: 'REJECTED', processedAt: new Date() } })
  } else {
    if (refund.status === 'PROCESSED') return fail('Refund already processed', 409)
    if (refund.status === 'REJECTED') return fail('Refund was rejected — it cannot be processed', 409)
    const amount = parsed.data.amountPaise ?? refund.amountPaise

    // Real gateway rails: submit to the provider FIRST — the ledger is only
    // touched when the gateway accepts the refund. SANDBOX_MOCK skips this
    // (the mock gateway already "returned" the money).
    const gateway = activeGateway()
    if (gateway !== 'SANDBOX_MOCK') {
      const payment = await db.payment.findFirst({
        where: { orderId: refund.orderId, status: 'SUCCESS' },
        orderBy: { createdAt: 'desc' },
      })
      if (!payment) return fail('No captured payment found on this order', 409)
      try {
        if (gateway === 'RAZORPAY') {
          const r = await submitRazorpayRefund(payment.providerRef, amount, { seatserve_refund: refund.id })
          await audit({
            actorRole: user.role,
            action: 'GATEWAY_REFUND_SUBMITTED',
            entityType: 'Refund',
            entityId: refund.id,
            orderId: refund.orderId,
            mallId: refund.order.mallId,
            meta: { gateway: 'RAZORPAY', gatewayRefundId: r.refundId, amountPaise: amount },
          })
        } else {
          const c = await submitCashfreeRefund(payment.providerRef, payment.providerRef, amount, refund.id)
          await audit({
            actorRole: user.role,
            action: 'GATEWAY_REFUND_SUBMITTED',
            entityType: 'Refund',
            entityId: refund.id,
            orderId: refund.orderId,
            mallId: refund.order.mallId,
            meta: { gateway: 'CASHFREE', gatewayRefundId: c.refundId, amountPaise: amount },
          })
        }
      } catch (err) {
        return fail(err instanceof Error ? err.message : 'Gateway refund failed', 502)
      }
    }

    const processed = await applyRefundToLedger(refund.orderId, amount)
    if (processed <= 0) return fail('Nothing left to refund on this order', 409)
    await db.refund.update({ where: { id }, data: { status: 'PROCESSED', processedAt: new Date(), amountPaise: amount } })
  }

  const auditAction = action === 'APPROVE' ? 'REFUND_APPROVED' : action === 'REJECT' ? 'REFUND_REJECTED' : 'REFUND_PROCESSED'
  await audit({
    actorRole: user.role,
    actorRef: user.email ?? user.id,
    action: auditAction,
    entityType: 'Refund',
    entityId: refund.id,
    orderId: refund.orderId,
    mallId: refund.order.mallId,
    meta: { code: refund.order.code, amountPaise: refund.amountPaise },
  })

  await emitToRooms({
    rooms: [`admin:${refund.order.mallId}`, `order:${refund.order.code}`],
    event: 'order:update',
    data: { code: refund.order.code, refundAction: action },
  })

  const fresh = await db.refund.findUnique({ where: { id }, include: { order: { select: { code: true, paymentStatus: true, refundedPaise: true } } } })
  return ok({
    refundId: id,
    status: fresh?.status,
    order: fresh?.order,
  })
}
