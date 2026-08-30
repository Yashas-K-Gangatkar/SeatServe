// GET /api/runner?runnerId=<id> — runner console data:
// queue (READY tickets + assigned runs), my runs, recent deliveries, roster.
import { db } from '@/lib/db'
import { ok } from '@/lib/api-helpers'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const runnerId = url.searchParams.get('runnerId') ?? undefined

  const readyTickets = await db.storeTicket.findMany({
    where: { status: 'READY_FOR_PICKUP' },
    include: {
      store: { select: { name: true, emoji: true } },
      order: { include: { seat: { include: { screen: { include: { cinema: true } } } }, showtime: true } },
      deliveryRun: { include: { runner: { select: { id: true, name: true } } } },
    },
    orderBy: { readyAt: 'asc' },
  })

  const runners = await db.runner.findMany({ where: { isOnDuty: true }, orderBy: { name: 'asc' } })

  const myRuns = runnerId
    ? await db.deliveryRun.findMany({
        where: { runnerId, status: { in: ['ASSIGNED', 'PICKED_UP'] } },
        include: {
          ticket: {
            include: {
              store: { select: { name: true, emoji: true } },
              order: { include: { seat: { include: { screen: { include: { cinema: true } } } }, showtime: true } },
            },
          },
        },
        orderBy: { assignedAt: 'asc' },
      })
    : []

  const recent = runnerId
    ? await db.deliveryRun.findMany({
        where: { runnerId, status: 'DELIVERED' },
        include: { ticket: { include: { store: { select: { name: true } }, order: { include: { seat: true } } } } },
        orderBy: { deliveredAt: 'desc' },
        take: 5,
      })
    : []

  const mapTicket = (t: (typeof readyTickets)[number]) => ({
    ticketId: t.id,
    ticketCode: t.ticketCode,
    orderCode: t.order.code,
    storeName: t.store.name,
    emoji: t.store.emoji,
    screen: t.order.seat.screen.name,
    cinema: t.order.seat.screen.cinema.name,
    seat: t.order.seat.code,
    movieTitle: t.order.showtime?.movieTitle ?? null,
    readyAt: t.readyAt,
    assignedTo: t.deliveryRun?.runner?.name ?? null,
    assignedToId: t.deliveryRun?.runner?.id ?? null,
    itemsCount: null as number | null,
  })

  return ok({
    runners: runners.map((r) => ({ id: r.id, name: r.name, rating: r.rating })),
    activeRunnerId: runnerId ?? null,
    queue: readyTickets.map(mapTicket),
    myRuns: myRuns.map((run) => ({
      runId: run.id,
      status: run.status,
      ticketId: run.ticket.id,
      ticketCode: run.ticket.ticketCode,
      orderCode: run.ticket.order.code,
      storeName: run.ticket.store.name,
      emoji: run.ticket.store.emoji,
      screen: run.ticket.order.seat.screen.name,
      cinema: run.ticket.order.seat.screen.cinema.name,
      seat: run.ticket.order.seat.code,
      movieTitle: run.ticket.order.showtime?.movieTitle ?? null,
      pickupLabel: run.pickupLabel,
      dropLabel: run.dropLabel,
      assignedAt: run.assignedAt,
      pickedUpAt: run.pickedUpAt,
    })),
    recent: recent.map((run) => ({
      runId: run.id,
      storeName: run.ticket.store.name,
      seat: run.ticket.order.seat.code,
      deliveredAt: run.deliveredAt,
    })),
    serverTime: new Date().toISOString(),
  })
}
