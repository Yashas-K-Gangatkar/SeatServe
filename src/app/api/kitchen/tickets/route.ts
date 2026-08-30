// GET /api/kitchen/tickets?storeId=<id> — paid, live tickets for ONE store only.
// Phase 2: login required. KITCHEN_STAFF/STORE_MANAGER are hard-locked to their
// own store (server-side, from the session — client params cannot widen it);
// MALL_ADMIN may supervise any store inside their mall.
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { canAccessStore } from '@/lib/auth'

const ACTIVE_STATUSES = ['NEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP'] as const

export async function GET(request: Request) {
  const auth = await requireStaff(request, ['KITCHEN_STAFF', 'STORE_MANAGER', 'MALL_ADMIN'])
  if ('error' in auth) return auth.error
  const user = auth.user

  const url = new URL(request.url)
  const storeId = url.searchParams.get('storeId')
  if (!storeId) return fail('storeId is required', 400)

  // accept CUID id OR slug (dashboards route by slug for readable URLs)
  const store = await db.store.findFirst({ where: { OR: [{ id: storeId }, { slug: storeId }] } })
  if (!store) return fail('Store not found', 404)

  // tenant isolation: a store cook can never read another store's tickets
  if (!canAccessStore(user, { id: store.id, mallId: store.mallId })) {
    return fail('Your account is not authorized for this store', 403)
  }

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
