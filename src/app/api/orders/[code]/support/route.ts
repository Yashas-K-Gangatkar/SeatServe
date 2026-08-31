// POST /api/orders/[code]/support — customer help / refund request
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { isRefundReason } from '@/lib/types'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'

const bodySchema = z.object({
  reason: z.string().refine(isRefundReason, 'Invalid reason'),
  detail: z.string().max(500).optional(),
  requestedAmountPaise: z.number().int().min(0).optional(),
})

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error

  const order = await db.order.findUnique({ where: { code: code.toUpperCase() } })
  if (!order) return fail('Order not found', 404)

  // Audit fix #6: refund requests were possible on UNPAID orders (nothing to
  // refund) and for ANY amount — even more than the order total.
  if (order.paymentStatus !== 'PAID' && order.paymentStatus !== 'PARTIALLY_REFUNDED') {
    return fail('This order has no captured payment to refund', 409)
  }
  const maxRefundable = order.totalPaise - order.refundedPaise
  if (maxRefundable <= 0) return fail('This order is already fully refunded', 409)
  const requested = parsed.data.requestedAmountPaise ?? maxRefundable
  if (requested > maxRefundable) {
    return fail(`Refund amount cannot exceed the refundable balance (₹${(maxRefundable / 100).toFixed(2)})`, 422)
  }

  const openCount = await db.refund.count({ where: { orderId: order.id, status: { in: ['REQUESTED', 'APPROVED'] } } })
  if (openCount > 0) return fail('A support request for this order is already open. Our team is on it.', 409)

  const refund = await db.refund.create({
    data: {
      orderId: order.id,
      amountPaise: Math.max(1, requested),
      reason: parsed.data.reason,
      detail: parsed.data.detail ?? null,
      status: 'REQUESTED',
      requestedByRole: 'CUSTOMER',
    },
  })

  await audit({
    actorRole: 'CUSTOMER',
    action: 'REFUND_REQUESTED',
    entityType: 'Refund',
    entityId: refund.id,
    orderId: order.id,
    mallId: order.mallId,
    meta: { reason: refund.reason, amountPaise: refund.amountPaise },
  })
  await emitToRooms({ rooms: [`admin:${order.mallId}`], event: 'order:update', data: { code: order.code, refundRequested: true } })

  return ok({ refundId: refund.id, status: refund.status, message: 'Request received. Refunds are processed by the finance desk.' }, 201)
}
