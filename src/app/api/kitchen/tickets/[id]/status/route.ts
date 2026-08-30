// POST /api/kitchen/tickets/[id]/status — advance the ticket state machine.
// NEW → ACCEPTED → PREPARING → READY_FOR_PICKUP (runner leg takes over after this).
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { canTransitionTicket, orderStatusFromTickets } from '@/lib/order-state'
import { isTicketStatus, type TicketStatus } from '@/lib/types'
import { requireStaff } from '@/lib/auth-server'
import { canAccessStore } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'

const bodySchema = z.object({
  to: z.string().refine(isTicketStatus, 'Unknown ticket status'),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Phase 2: only this store's kitchen/manager (or the mall admin) may advance tickets
  const auth = await requireStaff(request, ['KITCHEN_STAFF', 'STORE_MANAGER', 'MALL_ADMIN'])
  if ('error' in auth) return auth.error
  const user = auth.user

  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error
  const to = parsed.data.to as TicketStatus

  const ticket = await db.storeTicket.findUnique({
    where: { id },
    include: { order: { include: { seat: true, screen: { include: { cinema: true } } } }, store: true },
  })
  if (!ticket) return fail('Ticket not found', 404)

  if (!canAccessStore(user, { id: ticket.storeId, mallId: ticket.store.mallId })) {
    return fail('Your account is not authorized for this store', 403)
  }

  if (!canTransitionTicket(ticket.status as TicketStatus, to)) {
    return fail(`Cannot move ticket from ${ticket.status} to ${to}`, 409)
  }

  const now = new Date()
  const updated = await db.storeTicket.update({
    where: { id },
    data: {
      status: to,
      acceptedAt: to === 'ACCEPTED' ? now : ticket.acceptedAt,
      preparingAt: to === 'PREPARING' ? now : ticket.preparingAt,
      readyAt: to === 'READY_FOR_PICKUP' ? now : ticket.readyAt,
      pickedUpAt: to === 'PICKED_UP' ? now : ticket.pickedUpAt,
      deliveredAt: to === 'DELIVERED' ? now : ticket.deliveredAt,
      cancelledAt: to === 'CANCELLED' ? now : ticket.cancelledAt,
    },
  })

  // auto-assign an on-duty runner (wing-matched) the moment food is ready
  let assignedRunner: string | null = null
  if (to === 'READY_FOR_PICKUP') {
    const existingRun = await db.deliveryRun.findUnique({ where: { ticketId: ticket.id } })
    if (!existingRun) {
      const runners = await db.runner.findMany({ where: { isOnDuty: true }, include: { zone: true } })
      const wing = ticket.order.screen.cinema.wing
      const preferred = runners.find((r) => (wing ? r.zone?.name.includes(`Wing ${wing}`) : false)) ?? runners[0]
      if (preferred) {
        await db.deliveryRun.create({
          data: {
            ticketId: ticket.id,
            runnerId: preferred.id,
            status: 'ASSIGNED',
            pickupLabel: `${ticket.store.name} · Food court, ground floor`,
            dropLabel: `${ticket.order.screen.name} · Seat ${ticket.order.seat.code} · ${ticket.order.screen.cinema.name}`,
          },
        })
        assignedRunner = preferred.name
      }
    } else {
      const run = await db.deliveryRun.findUnique({ where: { ticketId: ticket.id }, include: { runner: true } })
      assignedRunner = run?.runner.name ?? null
    }
  }

  // recompute the order-level status from its tickets
  const allTickets = await db.storeTicket.findMany({ where: { orderId: ticket.orderId } })
  const nextOrderStatus = orderStatusFromTickets(allTickets.map((t) => ({ status: t.status as TicketStatus })))
  await db.order.update({ where: { id: ticket.orderId }, data: { status: nextOrderStatus } })

  await audit({
    actorRole: user.role,
    actorRef: user.email ?? user.id,
    action: 'TICKET_STATUS_CHANGED',
    entityType: 'StoreTicket',
    entityId: ticket.id,
    orderId: ticket.orderId,
    meta: { from: ticket.status, to, ticketCode: ticket.ticketCode },
  })

  await emitToRooms({
    rooms: [`store:${ticket.storeId}`, 'admin', `order:${ticket.order.code}`],
    event: 'ticket:status',
    data: { ticketId: ticket.id, status: to, orderCode: ticket.order.code },
  })
  if (to === 'READY_FOR_PICKUP') {
    await emitToRooms({
      rooms: ['runners', 'admin'],
      event: 'run:assigned',
      data: { ticketId: ticket.id, orderCode: ticket.order.code, runner: assignedRunner },
    })
  }

  return ok({ ticketId: ticket.id, status: updated.status, orderStatus: nextOrderStatus, assignedRunner })
}
