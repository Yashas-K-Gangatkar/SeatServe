// POST /api/runner/assign — claim a ready ticket for delivery (login required).
// RUNNER role is pinned to their own runner profile from the session;
// MALL_ADMIN may assign any on-duty runner (front-desk coordination).
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'

const bodySchema = z.object({
  ticketId: z.string().min(1),
  runnerId: z.string().min(1).optional(), // honored for MALL_ADMIN only
})

export async function POST(request: Request) {
  const auth = await requireStaff(request, ['RUNNER', 'MALL_ADMIN'])
  if ('error' in auth) return auth.error
  const user = auth.user

  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error

  const ticket = await db.storeTicket.findUnique({
    where: { id: parsed.data.ticketId },
    include: { store: true, order: { include: { seat: true, screen: { include: { cinema: true } } } } },
  })
  if (!ticket) return fail('Ticket not found', 404)
  if (ticket.status !== 'READY_FOR_PICKUP') return fail(`Ticket is ${ticket.status}, not READY_FOR_PICKUP`, 409)

  const existing = await db.deliveryRun.findUnique({ where: { ticketId: ticket.id } })
  if (existing) return fail('This ticket already has a runner assigned', 409)

  // session pinning: a runner can only self-assign; admins may pick any runner
  const requestedRunnerId = user.role === 'RUNNER' ? user.runnerId : (parsed.data.runnerId ?? null)
  const runner = requestedRunnerId
    ? await db.runner.findUnique({ where: { id: requestedRunnerId } })
    : (await db.runner.findFirst({ where: { isOnDuty: true }, orderBy: { name: 'asc' } }))
  if (!runner) return fail('No on-duty runner available', 409)
  if (user.role === 'RUNNER' && !runner.isOnDuty) return fail('You are off duty — clock in first', 409)

  const run = await db.deliveryRun.create({
    data: {
      ticketId: ticket.id,
      runnerId: runner.id,
      status: 'ASSIGNED',
      pickupLabel: `${ticket.store.name} · Food court, ground floor`,
      dropLabel: `${ticket.order.screen.name} · Seat ${ticket.order.seat.code} · ${ticket.order.screen.cinema.name}`,
    },
  })

  await audit({
    actorRole: user.role,
    actorRef: user.email ?? user.id,
    action: 'RUN_ASSIGNED',
    entityType: 'DeliveryRun',
    entityId: run.id,
    orderId: ticket.orderId,
    meta: { ticketCode: ticket.ticketCode, runner: runner.name },
  })
  await emitToRooms({ rooms: ['runners', 'admin', `order:${ticket.order.code}`], event: 'run:assigned', data: { ticketId: ticket.id, runner: runner.name } })

  return ok({ runId: run.id, runner: runner.name, ticketId: ticket.id }, 201)
}
