// POST /api/kitchen/tickets/[id]/status — advance the ticket state machine.
// NEW → ACCEPTED → PREPARING → READY_FOR_PICKUP (runner leg takes over after this).
// CANCELLED is allowed from NEW/ACCEPTED/PREPARING (food not yet out) and now
// correctly voids that store's settlement leg + auto-opens a refund.
//
// Audit fixes in this route:
//   #1  — an UNPAID order could be advanced to status PAID via this API. Now
//         every non-cancel transition requires paymentStatus === 'PAID', and
//         the kitchen can no longer perform RUNNER-leg transitions.
//   #5  — cancelled tickets kept their FULL settlement splits. Now the leg is
//         voided in the ledger and (if paid) an APPROVED refund auto-opens.
//   #25 — check-then-write races: transitions now use an optimistic guard
//         (write only if status is still the one we validated).
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { canTransitionTicket, orderStatusFromTickets, kitchenControls } from '@/lib/order-state'
import { isTicketStatus, type TicketStatus } from '@/lib/types'
import { requireStaff } from '@/lib/auth-server'
import { canAccessStore } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'
import { voidStoreLeg } from '@/lib/refunds'

const bodySchema = z.object({
  to: z.string().refine(isTicketStatus, 'Unknown ticket status'),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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

  // Audit fix #1 (role boundaries): kitchenControls() existed in the state
  // machine but was never enforced — kitchen staff could mark PICKED_UP /
  // DELIVERED. The runner leg is NOT theirs; neither is the reverse.
  if (to !== 'CANCELLED' && !kitchenControls(ticket.status as TicketStatus)) {
    return fail(`Kitchen controls NEW/ACCEPTED/PREPARING only — ticket is ${ticket.status}`, 409)
  }
  if (!canTransitionTicket(ticket.status as TicketStatus, to)) {
    return fail(`Cannot move ticket from ${ticket.status} to ${to}`, 409)
  }

  // Audit fix #1: no staff route may advance an UNPAID order — food only
  // starts after the money is captured. Cancellation stays allowed (customer
  // service must always be able to stop an unpaid order).
  if (to !== 'CANCELLED' && ticket.order.paymentStatus !== 'PAID') {
    return fail('Payment for this order is not captured yet — accept nothing until it is PAID', 409)
  }

  const from = ticket.status as TicketStatus
  const now = new Date()
  // Audit fix #25: optimistic guard — only write if the status is unchanged
  const guard = await db.storeTicket.updateMany({
    where: { id, status: from },
    data: {
      status: to,
      acceptedAt: to === 'ACCEPTED' ? now : undefined,
      preparingAt: to === 'PREPARING' ? now : undefined,
      readyAt: to === 'READY_FOR_PICKUP' ? now : undefined,
      cancelledAt: to === 'CANCELLED' ? now : undefined,
      cancelledByRole: to === 'CANCELLED' ? user.role : undefined,
    },
  })
  if (guard.count === 0) {
    return fail(`Ticket already moved on — it is no longer ${from}`, 409)
  }

  // auto-assign an on-duty runner (wing-matched) the moment food is ready
  let assignedRunner: string | null = null
  if (to === 'READY_FOR_PICKUP') {
    const existingRun = await db.deliveryRun.findUnique({ where: { ticketId: ticket.id } })
    if (!existingRun) {
      const runners = await db.runner.findMany({ where: { isOnDuty: true, zone: { mallId: ticket.order.mallId } }, include: { zone: true } })
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

  // Audit fix #5: a cancelled leg must NEVER keep its settlement splits.
  if (to === 'CANCELLED') {
    await voidStoreLeg(ticket.orderId, ticket.storeId)
  }

  // recompute the order-level status from its tickets
  const allTickets = await db.storeTicket.findMany({ where: { orderId: ticket.orderId } })
  const nextOrderStatus = orderStatusFromTickets(allTickets.map((t) => ({ status: t.status as TicketStatus })))
  await db.order.update({
    where: { id: ticket.orderId },
    data: { status: nextOrderStatus, completedAt: nextOrderStatus === 'COMPLETED' ? now : ticket.order.completedAt },
  })

  await audit({
    actorRole: user.role,
    actorRef: user.email ?? user.id,
    action: 'TICKET_STATUS_CHANGED',
    entityType: 'StoreTicket',
    entityId: ticket.id,
    orderId: ticket.orderId,
    mallId: ticket.store.mallId,
    meta: { from, to, ticketCode: ticket.ticketCode },
  })

  await emitToRooms({
    rooms: [`store:${ticket.storeId}`, `admin:${ticket.order.mallId}`, `order:${ticket.order.code}`],
    event: 'ticket:status',
    data: { ticketId: ticket.id, status: to, orderCode: ticket.order.code },
  })
  if (to === 'READY_FOR_PICKUP') {
    await emitToRooms({
      rooms: [`runners:${ticket.order.mallId}`, `admin:${ticket.order.mallId}`],
      event: 'run:assigned',
      data: { ticketId: ticket.id, orderCode: ticket.order.code, runner: assignedRunner },
    })
  }

  return ok({ ticketId: ticket.id, status: to, orderStatus: nextOrderStatus, assignedRunner })
}
