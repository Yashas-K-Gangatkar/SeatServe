// GET /api/runner — runner console data (login required).
// RUNNER role: "my runs" are derived from the session's runnerId — a runner can
// never read another runner's runs. CAMPUS_ADMIN: full board + ?runnerId= filter.
import { db } from '@/lib/db'
import { ok } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'

export async function GET(request: Request) {
  const auth = await requireStaff(request, ['RUNNER', 'CAMPUS_ADMIN'])
  if ('error' in auth) return auth.error
  const user = auth.user

  const url = new URL(request.url)
  // session wins over query param: runners are pinned to themselves
  const runnerId = user.role === 'RUNNER' ? (user.runnerId ?? undefined) : (url.searchParams.get('runnerId') ?? undefined)

  // Audit fix #16: the queue used to be PLATFORM-WIDE — a runner in Mumbai saw
  // and could claim ready tickets in Pune. Scope everything to the caller's campus:
  //   RUNNER      → the campus of their own delivery zone
  //   CAMPUS_ADMIN  → their campus
  let campusId: string | null = null
  if (user.role === 'RUNNER') {
    const runner = await db.runner.findUnique({ where: { id: user.runnerId ?? '' }, include: { zone: true } })
    campusId = runner?.zone?.campusId ?? null
  } else {
    campusId = user.campusId ?? null
  }
  const mallScope = { order: { campusId: campusId ?? '__none__' } }

  const readyTickets = await db.storeTicket.findMany({
    where: { status: 'READY_FOR_PICKUP', ...mallScope },
    include: {
      store: { select: { name: true, emoji: true } },
      order: { include: { seat: true, classroom: { include: { block: true } }, lecture: true } },
      deliveryRun: { include: { runner: { select: { id: true, name: true } } } },
    },
    orderBy: { readyAt: 'asc' },
  })

  // only runners belonging to this campus's zones
  const runners = await db.runner.findMany({
    where: { isOnDuty: true, zone: { campusId: campusId ?? '__none__' } },
    orderBy: { name: 'asc' },
  })

  const myRuns = runnerId
    ? await db.deliveryRun.findMany({
        where: { runnerId, status: { in: ['ASSIGNED', 'PICKED_UP'] }, ticket: { ...mallScope } },
        include: {
          ticket: {
            include: {
              store: { select: { name: true, emoji: true } },
              order: { include: { seat: true, classroom: { include: { block: true } }, lecture: true } },
            },
          },
        },
        orderBy: { assignedAt: 'asc' },
      })
    : []

  const recent = runnerId
    ? await db.deliveryRun.findMany({
        where: { runnerId, status: 'DELIVERED' },
        include: { ticket: { include: { store: { select: { name: true } }, order: { include: { seat: true, classroom: true } } } } },
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
    classroom: t.order.classroom.name,
    block: t.order.classroom.block.name,
    seat: t.order.seat?.code ?? t.order.seatLabel ?? 'door',
    subject: t.order.lecture?.subject ?? null,
    readyAt: t.readyAt,
    scheduledFor: t.order.scheduledFor,
    assignedTo: t.deliveryRun?.runner?.name ?? null,
    assignedToId: t.deliveryRun?.runner?.id ?? null,
    itemsCount: null as number | null,
  })

  return ok({
    campusId, // caller's campus scope (for the token-gated runners:<campusId> room)
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
      classroom: run.ticket.order.classroom.name,
      block: run.ticket.order.classroom.block.name,
      seat: run.ticket.order.seat?.code ?? run.ticket.order.seatLabel ?? 'door',
      subject: run.ticket.order.lecture?.subject ?? null,
      scheduledFor: run.ticket.order.scheduledFor,
      pickupLabel: run.pickupLabel,
      dropLabel: run.dropLabel,
      assignedAt: run.assignedAt,
      pickedUpAt: run.pickedUpAt,
    })),
    recent: recent.map((run) => ({
      runId: run.id,
      storeName: run.ticket.store.name,
      seat: run.ticket.order.seat?.code ?? run.ticket.order.seatLabel ?? '—',
      deliveredAt: run.deliveredAt,
    })),
    serverTime: new Date().toISOString(),
  })
}
