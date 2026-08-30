// POST /api/runner/tickets/[id]/status — PICKED_UP | DELIVERED (runner leg).
// Phase 2: login required; a RUNNER may only advance runs assigned to them.
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { orderStatusFromTickets } from '@/lib/order-state'
import type { TicketStatus } from '@/lib/types'
import { requireStaff } from '@/lib/auth-server'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'

const bodySchema = z.object({
  to: z.enum(['PICKED_UP', 'DELIVERED']),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireStaff(request, ['RUNNER', 'MALL_ADMIN'])
  if ('error' in auth) return auth.error
  const user = auth.user

  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error
  const to = parsed.data.to

  const ticket = await db.storeTicket.findUnique({
    where: { id },
    include: { order: true, store: true, deliveryRun: { include: { runner: true } } },
  })
  if (!ticket) return fail('Ticket not found', 404)

  // tenant isolation: a runner can only advance their own assigned runs
  if (user.role === 'RUNNER' && ticket.deliveryRun?.runnerId !== user.runnerId) {
    return fail('This run is not assigned to you', 403)
  }

  const allowed: Partial<Record<TicketStatus, string[]>> = {
    READY_FOR_PICKUP: ['PICKED_UP'],
    PICKED_UP: ['DELIVERED'],
  }
  const from = ticket.status as TicketStatus
  if (!allowed[from]?.includes(to)) {
    return fail(`Cannot move ticket from ${from} to ${to}. Runner controls READY_FOR_PICKUP → PICKED_UP → DELIVERED.`, 409)
  }

  const now = new Date()
  if (to === 'PICKED_UP') {
    await db.storeTicket.update({ where: { id }, data: { status: 'PICKED_UP', pickedUpAt: now } })
    if (ticket.deliveryRun) {
      await db.deliveryRun.update({ where: { id: ticket.deliveryRun.id }, data: { status: 'PICKED_UP', pickedUpAt: now } })
    }
  } else {
    await db.storeTicket.update({ where: { id }, data: { status: 'DELIVERED', deliveredAt: now } })
    if (ticket.deliveryRun) {
      await db.deliveryRun.update({ where: { id: ticket.deliveryRun.id }, data: { status: 'DELIVERED', deliveredAt: now } })
    }
  }

  const allTickets = await db.storeTicket.findMany({ where: { orderId: ticket.orderId } })
  const nextOrderStatus = orderStatusFromTickets(allTickets.map((t) => ({ status: t.status as TicketStatus })))
  await db.order.update({
    where: { id: ticket.orderId },
    data: { status: nextOrderStatus, completedAt: nextOrderStatus === 'COMPLETED' ? now : ticket.order.completedAt },
  })

  await audit({
    actorRole: user.role,
    actorRef: user.email ?? user.id,
    action: to === 'PICKED_UP' ? 'RUN_PICKED_UP' : 'RUN_DELIVERED',
    entityType: 'StoreTicket',
    entityId: ticket.id,
    orderId: ticket.orderId,
    meta: { ticketCode: ticket.ticketCode },
  })
  await emitToRooms({
    rooms: [`order:${ticket.order.code}`, `store:${ticket.storeId}`, 'runners', 'admin'],
    event: 'ticket:status',
    data: { ticketId: ticket.id, status: to, orderCode: ticket.order.code },
  })

  return ok({ ticketId: ticket.id, status: to, orderStatus: nextOrderStatus })
}
