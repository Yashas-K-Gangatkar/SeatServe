// GET /api/admin/overview — mall-wide live board + KPIs (rolling 24h window)
import { db } from '@/lib/db'
import { ok } from '@/lib/api-helpers'

export async function GET() {
  const since = new Date(Date.now() - 24 * 3600_000)

  const [orders, liveOrders, tickets, runs, refunds, splits, stores, recentAudit] = await Promise.all([
    db.order.findMany({ where: { placedAt: { gte: since } }, include: { tickets: true, payments: true, refunds: true } }),
    db.order.findMany({
      where: { paymentStatus: 'PAID', status: { in: ['PAID', 'PARTIALLY_CANCELLED'] } },
      include: {
        seat: { include: { screen: { include: { cinema: true } } } },
        tickets: { include: { store: { select: { name: true, emoji: true } } } },
      },
      orderBy: { placedAt: 'desc' },
      take: 30,
    }),
    db.storeTicket.findMany({
      where: { createdAt: { gte: since }, acceptedAt: { not: null }, readyAt: { not: null } },
      select: { acceptedAt: true, readyAt: true, storeId: true, status: true, subtotalPaise: true },
    }),
    db.deliveryRun.findMany({
      where: { assignedAt: { gte: since }, pickedUpAt: { not: null }, deliveredAt: { not: null } },
      select: { pickedUpAt: true, deliveredAt: true },
    }),
    db.refund.findMany({ where: { createdAt: { gte: since } }, include: { order: { select: { code: true, totalPaise: true } } }, orderBy: { createdAt: 'desc' } }),
    db.split.groupBy({ by: ['beneficiary'], _sum: { amountPaise: true }, where: { settlementStatus: 'PENDING' } }),
    db.store.findMany({ include: { products: { select: { id: true, name: true, isAvailable: true } }, _count: { select: { tickets: true } } }, orderBy: { name: 'asc' } }),
    db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20, include: { order: { select: { code: true } } } }),
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
      tickets: o.tickets.map((t) => ({ storeName: t.store.name, emoji: t.store.emoji, status: t.status, ticketId: t.id })),
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
