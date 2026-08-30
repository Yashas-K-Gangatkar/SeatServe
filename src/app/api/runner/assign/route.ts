// POST /api/runner/assign — claim a ready ticket for delivery
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'

const bodySchema = z.object({
  ticketId: z.string().min(1),
  runnerId: z.string().min(1).optional(), // defaults to first on-duty runner (demo)
})

export async function POST(request: Request) {
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

  const runner = parsed.data.runnerId
    ? await db.runner.findUnique({ where: { id: parsed.data.runnerId } })
    : (await db.runner.findFirst({ where: { isOnDuty: true }, orderBy: { name: 'asc' } }))
  if (!runner) return fail('No on-duty runner available', 409)

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
    actorRole: 'RUNNER',
    actorRef: runner.name,
    action: 'RUN_ASSIGNED',
    entityType: 'DeliveryRun',
    entityId: run.id,
    orderId: ticket.orderId,
    meta: { ticketCode: ticket.ticketCode, runner: runner.name },
  })
  await emitToRooms({ rooms: ['runners', 'admin', `order:${ticket.order.code}`], event: 'run:assigned', data: { ticketId: ticket.id, runner: runner.name } })

  return ok({ runId: run.id, runner: runner.name, ticketId: ticket.id }, 201)
}
