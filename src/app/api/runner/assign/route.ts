// POST /api/runner/assign — claim a ready ticket for delivery (login required).
// RUNNER role is pinned to their own runner profile from the session;
// CAMPUS_ADMIN may assign any on-duty runner (front-desk coordination).
import { z } from 'zod'
import type { Runner, DeliveryZone } from '@prisma/client'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'

const bodySchema = z.object({
  ticketId: z.string().min(1),
  runnerId: z.string().min(1).optional(), // honored for CAMPUS_ADMIN only
})

export async function POST(request: Request) {
  const auth = await requireStaff(request, ['RUNNER', 'CAMPUS_ADMIN'])
  if ('error' in auth) return auth.error
  const user = auth.user

  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error

  const ticket = await db.storeTicket.findUnique({
    where: { id: parsed.data.ticketId },
    include: { store: true, order: { include: { seat: true, classroom: { include: { block: true } } } } },
  })
  if (!ticket) return fail('Ticket not found', 404)
  if (ticket.status !== 'READY_FOR_PICKUP') return fail(`Ticket is ${ticket.status}, not READY_FOR_PICKUP`, 409)

  const existing = await db.deliveryRun.findUnique({ where: { ticketId: ticket.id } })
  if (existing) return fail('This ticket already has a runner assigned', 409)

  // Audit fix #17: no campus scoping — a runner could claim a ticket in another
  // campus. Resolve the caller's campus (runner → their zone's campus, admin → campusId)
  // and require the ticket to live in it.
  let callerMallId: string | null = null
  if (user.role === 'RUNNER') {
    const me = await db.runner.findUnique({ where: { id: user.runnerId ?? '' }, include: { zone: true } })
    callerMallId = me?.zone?.campusId ?? null
  } else {
    callerMallId = user.campusId ?? null
  }
  if (ticket.order.campusId !== callerMallId) {
    return fail('This ticket is outside your campus', 403)
  }

  // session pinning: a runner can only self-assign; admins may pick any runner
  // NOTE: both branches carry `include: { zone: true }` (the campus check below needs
  // it for either path). An explicit annotation avoids Prisma's conditional-type
  // collapse across a ternary union (findUnique vs findFirst arg shapes differ),
  // which silently dropped `zone` from the inferred type and broke tsc.
  const requestedRunnerId = user.role === 'RUNNER' ? user.runnerId : (parsed.data.runnerId ?? null)
  let runner: (Runner & { zone: DeliveryZone | null }) | null
  if (requestedRunnerId) {
    runner = await db.runner.findUnique({ where: { id: requestedRunnerId }, include: { zone: true } })
  } else {
    runner = await db.runner.findFirst({
      where: { isOnDuty: true, zone: { campusId: callerMallId ?? '__none__' } },
      orderBy: { name: 'asc' },
      include: { zone: true },
    })
  }
  if (!runner) return fail('No on-duty runner available', 409)
  if (user.role === 'RUNNER' && !runner.isOnDuty) return fail('You are off duty — clock in first', 409)
  // the assigned runner must also belong to the same campus as the ticket
  if ((runner.zone?.campusId ?? null) !== ticket.order.campusId) {
    return fail('That runner belongs to a different campus', 409)
  }

  // Audit fix #24: two runners pressing "claim" at the same instant both passed
  // the existence check above — the loser used to surface as an unhandled
  // P2002 unique-violation 500. The unique index on DeliveryRun.ticketId is
  // the real guard; translate the violation into an honest 409.
  let run
  try {
    run = await db.deliveryRun.create({
      data: {
        ticketId: ticket.id,
        runnerId: runner.id,
        status: 'ASSIGNED',
        pickupLabel: `${ticket.store.name} · Food court, ground floor`,
        dropLabel: `${ticket.order.classroom.name} · ${ticket.order.seat?.code ?? ticket.order.seatLabel ?? 'door delivery'} · ${ticket.order.classroom.block.name}`,
      },
    })
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'P2002') {
      return fail('This ticket already has a runner assigned', 409)
    }
    throw err
  }

  await audit({
    actorRole: user.role,
    actorRef: user.email ?? user.id,
    action: 'RUN_ASSIGNED',
    entityType: 'DeliveryRun',
    entityId: run.id,
    orderId: ticket.orderId,
    campusId: ticket.order.campusId,
    meta: { ticketCode: ticket.ticketCode, runner: runner.name },
  })
  await emitToRooms({ rooms: [`runners:${ticket.order.campusId}`, `admin:${ticket.order.campusId}`, `order:${ticket.order.code}`], event: 'run:assigned', data: { ticketId: ticket.id, runner: runner.name } })

  return ok({ runId: run.id, runner: runner.name, ticketId: ticket.id }, 201)
}
