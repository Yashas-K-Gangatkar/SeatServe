// GET /api/admin/overview — live board + KPIs (rolling 24h window).
// Phase 2 multi-tenancy: the board is scoped by the session, never by params.
//   MALL_ADMIN     → everything inside their mall
//   CINEMA_MANAGER → orders of their own cinema; stores of their mall
//                    (delegated mall operator — verifies/feeds mall stores)
//   STORE_MANAGER  → only orders containing their store's tickets + their store row
import { db } from '@/lib/db'
import { ok } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'

export async function GET(request: Request) {
  const auth = await requireStaff(request, ['MALL_ADMIN', 'CINEMA_MANAGER', 'STORE_MANAGER'])
  if ('error' in auth) return auth.error
  const user = auth.user

  const since = new Date(Date.now() - 24 * 3600_000)

  // resolved mall for the token-gated realtime room (admin:<mallId>); the
  // CINEMA_MANAGER row carries mallId, but resolve from the cinema as a
  // fallback for legacy rows — the same mall anchors the store scope below.
  let realtimeMallId: string | null = null
  if (user.role === 'MALL_ADMIN' || user.role === 'RUNNER') realtimeMallId = user.mallId
  else if (user.role === 'CINEMA_MANAGER') {
    if (user.mallId) realtimeMallId = user.mallId
    else if (user.cinemaId) {
      const cinema = await db.cinema.findUnique({ where: { id: user.cinemaId }, select: { mallId: true } })
      realtimeMallId = cinema?.mallId ?? null
    }
  } else if (user.role === 'STORE_MANAGER' && user.storeId) {
    const store = await db.store.findUnique({ where: { id: user.storeId }, select: { mallId: true } })
    realtimeMallId = store?.mallId ?? null
  }

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
      : user.role === 'CINEMA_MANAGER'
        // audit fix: was unfiltered (platform-wide store list) — pin to the
        // cinema manager's mall so delegation can never see another mall
        ? { mallId: realtimeMallId ?? '__none__' }
        : { id: user.storeId ?? '__none__' }
  const scopeLabel =
    user.role === 'MALL_ADMIN'
      ? 'Mall-wide'
      : user.role === 'CINEMA_MANAGER'
        ? 'Cinema orders · mall stores'
        : 'Your store only'

  //   (realtime room + mall name resolved above, before the parallel reads)
  const mallName = realtimeMallId ? (await db.mall.findUnique({ where: { id: realtimeMallId }, select: { name: true } }))?.name ?? null : null

  const [orders, liveOrders, stores, recentAudit] = await Promise.all([
    db.order.findMany({ where: { placedAt: { gte: since }, ...orderScope }, include: { tickets: true, payments: true } }),
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
      where: storeScope,
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

  // scope-follower queries (tickets/runs/splits ride on scoped orders)
  const [tickets, allTickets, runs, splits, storeSplitSums] = await Promise.all([
    db.storeTicket.findMany({
      where: { createdAt: { gte: since }, acceptedAt: { not: null }, readyAt: { not: null }, orderId: { in: orderIds } },
      select: { acceptedAt: true, readyAt: true, storeId: true, status: true, subtotalPaise: true },
    }),
    // Audit fix #8: "ordersLast24h" counted only tickets that were already
    // accepted AND ready — brand-new tickets were invisible. Count them all.
    db.storeTicket.findMany({
      where: { createdAt: { gte: since }, orderId: { in: orderIds } },
      select: { storeId: true, status: true },
    }),
    db.deliveryRun.findMany({
      where: { assignedAt: { gte: since }, pickedUpAt: { not: null }, deliveredAt: { not: null }, ticket: { orderId: { in: orderIds } } },
      select: { pickedUpAt: true, deliveredAt: true },
    }),
    db.split.groupBy({ by: ['beneficiary'], _sum: { amountPaise: true }, where: { order: { id: { in: orderIds } }, settlementStatus: 'PENDING' } }),
    // Audit fix #7: net per-store sales come from the ledger itself —
    // STORE rows minus their negative void adjustments.
    db.split.groupBy({ by: ['storeId'], _sum: { amountPaise: true }, where: { orderId: { in: orderIds }, beneficiary: 'STORE' } }),
  ])

  // Money never moves back online (cinema policy), so every captured payment
  // counts as sales; exceptions are resolved at the counter, off the books.
  const paidOrders = orders.filter((o) => o.paymentStatus === 'PAID')
  const salesPaise = paidOrders.reduce((s, o) => s + o.totalPaise, 0)
  const aovPaise = paidOrders.length > 0 ? Math.round(salesPaise / paidOrders.length) : 0

  const prepSamples = tickets.map((t) => (new Date(t.readyAt!).getTime() - new Date(t.acceptedAt!).getTime()) / 60_000)
  const avgPrepMin = prepSamples.length ? Math.round(prepSamples.reduce((a, b) => a + b, 0) / prepSamples.length) : null

  const deliverySamples = runs.map((r) => (new Date(r.deliveredAt!).getTime() - new Date(r.pickedUpAt!).getTime()) / 60_000)
  const avgDeliveryMin = deliverySamples.length ? Math.round(deliverySamples.reduce((a, b) => a + b, 0) / deliverySamples.length) : null

  const perStore = stores.map((s) => {
    const storeTickets = allTickets.filter((t) => t.storeId === s.id)
    const netStorePaise = storeSplitSums.find((r) => r.storeId === s.id)?._sum.amountPaise ?? 0
    return {
      id: s.id,
      name: s.name,
      emoji: s.emoji,
      isOpen: s.isOpen,
      kycStatus: s.kycStatus,
      kycSubmitted: !!s.kycDetail,
      kycDetail: s.kycDetail
        ? (JSON.parse(s.kycDetail) as { gstin: string; panMasked: string; bankMasked: string; fssai: string })
        : null,
      commissionPct: s.commissionPct,
      ordersLast24h: storeTickets.length,
      salesPaise: Math.max(0, netStorePaise),
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
      realtimeMallId,
      mallName,
    },
    window: { since, label: 'last 24 hours' },
    kpis: {
      salesPaise,
      ordersCount: paidOrders.length,
      aovPaise,
      avgPrepMin,
      avgDeliveryMin,
      cancellations: orders.filter((o) => o.status === 'CANCELLED' || o.status === 'PARTIALLY_CANCELLED').length,
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
