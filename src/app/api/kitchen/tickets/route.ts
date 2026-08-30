// GET /api/kitchen/tickets?storeId=<id> — paid, live tickets for ONE store only.
// A store can never see another store's tickets (Phase 1 demo: enforced by query; Phase 2: by role).
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'

const ACTIVE_STATUSES = ['NEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP'] as const

export async function GET(request: Request) {
  const url = new URL(request.url)
  const storeId = url.searchParams.get('storeId')
  if (!storeId) return fail('storeId is required', 400)

  // accept CUID id OR slug (dashboards route by slug for readable URLs)
  const store = await db.store.findFirst({ where: { OR: [{ id: storeId }, { slug: storeId }] } })
  if (!store) return fail('Store not found', 404)

  const tickets = await db.storeTicket.findMany({
    where: { storeId: store.id, status: { in: [...ACTIVE_STATUSES, 'PICKED_UP', 'DELIVERED'] }, order: { paymentStatus: 'PAID' } },
    include: {
      order: {
        include: {
          seat: { include: { screen: { include: { cinema: true } } } },
          showtime: true,
        },
      },
      deliveryRun: { include: { runner: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  })

  const items = await db.orderItem.findMany({
    where: { storeId: store.id, orderId: { in: tickets.map((t) => t.orderId) } },
  })
  const itemsByOrder = new Map<string, typeof items>()
  for (const item of items) {
    const list = itemsByOrder.get(item.orderId) ?? []
    list.push(item)
    itemsByOrder.set(item.orderId, list)
  }

  const order = [...ACTIVE_STATUSES, 'PICKED_UP', 'DELIVERED'] as const
  const rank = Object.fromEntries(order.map((s, i) => [s, i])) as Record<string, number>

  return ok({
    store: { id: store.id, name: store.name, emoji: store.emoji, isOpen: store.isOpen, slug: store.slug },
    tickets: tickets
      .map((t) => ({
        ticketId: t.id,
        ticketCode: t.ticketCode,
        status: t.status,
        placedAt: t.order.placedAt,
        acceptedAt: t.acceptedAt,
        preparingAt: t.preparingAt,
        readyAt: t.readyAt,
        pickedUpAt: t.pickedUpAt,
        deliveredAt: t.deliveredAt,
        prepEtaMinutes: t.prepEtaMinutes,
        screen: t.order.seat.screen.name,
        cinema: t.order.seat.screen.cinema.name,
        seat: t.order.seat.code,
        movieTitle: t.order.showtime?.movieTitle ?? null,
        showStartsAt: t.order.showtime?.startsAt ?? null,
        orderCode: t.order.code,
        customerName: t.order.customerName,
        items: (itemsByOrder.get(t.orderId) ?? []).map((i) => ({
          name: i.nameSnapshot,
          qty: i.qty,
          notes: i.notes,
          lineTotalPaise: i.lineTotalPaise,
        })),
        subtotalPaise: t.subtotalPaise,
        runner: t.deliveryRun?.runner.name ?? null,
      }))
      .sort((a, b) => rank[a.status] - rank[b.status] || new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime()),
    serverTime: new Date().toISOString(),
  })
}
