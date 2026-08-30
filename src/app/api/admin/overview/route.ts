// GET /api/admin/overview — live board + KPIs (rolling 24h window).
// Phase 2 multi-tenancy: the board is scoped by the session, never by params.
//   MALL_ADMIN     → everything inside their mall
//   CINEMA_MANAGER → only orders/placements of their own cinema
//   STORE_MANAGER  → only orders containing their store's tickets + their store row
import { db } from '@/lib/db'
import { ok } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'

export async function GET(request: Request) {
  const auth = await requireStaff(request, ['MALL_ADMIN', 'CINEMA_MANAGER', 'STORE_MANAGER'])
  if ('error' in auth) return auth.error
  const user = auth.user

  const since = new Date(Date.now() - 24 * 3600_000)

  // ── tenant scope ────────────────────────────────────────────────
  const orderScope =
    user.role === 'MALL_ADMIN'
      ? { mallId: user.mallId ?? '__none__' }
      : user.role === 'CINEMA_MANAGER'
        ? { screen: { cinemaId: user.cinemaId ?? '__none__' } }
        : { tickets: { some: { storeId: user.storeId ?? '__none__' } } }
  const storeScope =
    user.role === 'MALL_ADMIN'
      ? { mallId: user.mallId ?? '__none__' }
      : user.role === 'STORE_MANAGER'
        ? { id: user.storeId ?? '__none__' }
        : null
  const scopeLabel = user.role === 'MALL_ADMIN' ? 'Mall-wide' : user.role === 'CINEMA_MANAGER' ? 'Your cinema only' : 'Your store only'

  const [orders, liveOrders, stores, recentAudit] = await Promise.all([
    db.order.findMany({ where: { placedAt: { gte: since }, ...orderScope }, include: { tickets: true, payments: true, refunds: true } }),
    db.order.findMany({
      where: { paymentStatus: 'PAID', status: { in: ['PAID', 'PARTIALLY_CANCELLED'] }, ...orderScope },
      include: {
        seat: { include: { screen: { include: { cinema: true } } } },
        tickets: { include: { store: { select: { name: true, emoji: true } } } },
      },
      orderBy: { placedAt: 'desc' },
      take: 30,
    }),
    db.store.findMany({
      where: storeScope ?? undefined,
      include: { products: { select: { id: true, name: true, isAvailable: true } }, _count: { select: { tickets: true } } },
      orderBy: { name: 'asc' },
    }),
    db.auditLog.findMany({
      where: { order: orderScope },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { order: { select: { code: true } } },
    }),
  ])

  const orderIds = orders.map((o) => o.id)

  // scope-follower queries (tickets/refunds/runs/splits ride on scoped orders)
  const [tickets, runs, refunds, splits] = await Promise.all([
    db.storeTicket.findMany({
      where: { createdAt: { gte: since }, acceptedAt: { not: null }, readyAt: { not: null }, orderId: { in: orderIds } },
      select: { acceptedAt: true, readyAt: true, storeId: true, status: true, subtotalPaise: true },
    }),
    db.deliveryRun.findMany({
      where: { assignedAt: { gte: since }, pickedUpAt: { not: null }, deliveredAt: { not: null }, ticket: { orderId: { in: orderIds } } },
      select: { pickedUpAt: true, deliveredAt: true },
    }),
    db.refund.findMany({
      where: { createdAt: { gte: since }, orderId: { in: orderIds } },
      include: { order: { select: { code: true, totalPaise: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    db.split.groupBy({ by: ['beneficiary'], _sum: { amountPaise: true }, where: { order: { id: { in: orderIds } } , settlementStatus: 'PENDING' } }),
  ])

  const paidOrders = orders.filter((o) => o.paymentStatus === 'PAID' || o.paymentStatus === 'REFUNDED' || o.paymentStatus === 'PARTIALLY_REFUNDED')
  const salesPaise = paidOrders.reduce((s, o) => s + o.totalPaise, 0)
  const aovPaise = paidOrders.length > 0 ? Math.round(salesPaise / paidOrders.length) : 0

  const prepSamples = tickets.map((t) => (new Date(t.readyAt!).getTime() - new Date(t.acceptedAt!).getTime()) / 60_000)
  const avgPrepMin = prepSamples.length ? Math.round(prepSamples.reduce((a, b) => a + b, 0) / prepSamples.length) : null

  const deliverySamples = runs.map((r) => (new Date(r.deliveredAt!).getTime() - new Date(r.pickedUpAt!).getTime()) / 60_000)
  const avgDeliveryMin = deliverySamples.length ? Math.round(deliverySamples.reduce((a, b) => a + b, 0) / deliverySamples.length) : null

  const perStore = stores.map((s) => {
    const storeTickets = tickets.filter((t) => t.storeId === s.id)
    const sales = paidOrders.reduce((sum, o) => sum + o.tickets.filter((t) => t.storeId === s.id).reduce((x, t) => x + t.subtotalPaise, 0), 0)
    return {
      id: s.id,
      name: s.name,
      emoji: s.emoji,
      isOpen: s.isOpen,
      kycStatus: s.kycStatus,
      ordersLast24h: storeTickets.length,
      salesPaise: sales,
      liveTickets: storeTickets.filter((t) => !['DELIVERED', 'CANCELLED'].includes(t.status)).length,
      products: s.products,
    }
  })

  return ok({
    scope: {
      role: user.role,
      label: scopeLabel,
      mallId: user.mallId,
      cinemaId: user.cinemaId,
      storeId: user.storeId,
    },
    window: { since, label: 'last 24 hours' },
    kpis: {
      salesPaise,
      ordersCount: paidOrders.length,
      aovPaise,
      avgPrepMin,
      avgDeliveryMin,
      cancellations: orders.filter((o) => o.status === 'CANCELLED').length,
      refundsOpen: refunds.filter((r) => r.status === 'REQUESTED' || r.status === 'APPROVED').length,
    },
    liveOrders: liveOrders.map((o) => ({
      code: o.code,
      placedAt: o.placedAt,
      screen: o.seat.screen.name,
      cinema: o.seat.screen.cinema.name,
      seat: o.seat.code,
      totalPaise: o.totalPaise,
      status: o.status,
      // store managers see only their own leg of a shared multi-store order
      tickets: o.tickets
        .filter((t) => user.role !== 'STORE_MANAGER' || t.storeId === user.storeId)
        .map((t) => ({ storeName: t.store.name, emoji: t.store.emoji, status: t.status, ticketId: t.id })),
    })),
    refunds: refunds.map((r) => ({ id: r.id, code: r.order.code, reason: r.reason, detail: r.detail, status: r.status, amountPaise: r.amountPaise, createdAt: r.createdAt })),
    settlement: splits.map((s) => ({ beneficiary: s.beneficiary, pendingPaise: s._sum.amountPaise ?? 0 })),
    stores: perStore,
    audit: recentAudit.map((a) => ({
      id: a.id,
      at: a.createdAt,
      actorRole: a.actorRole,
      actorRef: a.actorRef,
      action: a.action,
      orderCode: a.order?.code ?? null,
      meta: a.meta ? (JSON.parse(a.meta) as Record<string, unknown>) : null,
    })),
    serverTime: new Date().toISOString(),
  })
}
