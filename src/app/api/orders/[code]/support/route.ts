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

  const openCount = await db.refund.count({ where: { orderId: order.id, status: { in: ['REQUESTED', 'APPROVED'] } } })
  if (openCount > 0) return fail('A support request for this order is already open. Our team is on it.', 409)

  const refund = await db.refund.create({
    data: {
      orderId: order.id,
      amountPaise: parsed.data.requestedAmountPaise ?? order.totalPaise,
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
    meta: { reason: refund.reason, amountPaise: refund.amountPaise },
  })
  await emitToRooms({ rooms: ['admin'], event: 'order:update', data: { code: order.code, refundRequested: true } })

  return ok({ refundId: refund.id, status: refund.status, message: 'Request received. Refunds are processed by the finance desk.' }, 201)
}
