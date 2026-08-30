import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const refunds = await db.refund.findMany({ orderBy: { createdAt: 'desc' }, take: 4, include: { order: { select: { code: true, subtotalPaise: true, platformFeePaise: true, totalPaise: true } } } })
for (const r of refunds) {
  console.log(JSON.stringify({ code: r.order.code, amount: r.amountPaise, reason: r.reason, status: r.status, sub: r.order.subtotalPaise, pf: r.order.platformFeePaise, total: r.order.totalPaise }))
}
const last = refunds.find((r) => r.reason === 'PARTIAL_STORE_CANCEL')
if (last) {
  const splits = await db.split.findMany({ where: { orderId: last.orderId }, orderBy: { createdAt: 'asc' } })
  console.log('splits:', JSON.stringify(splits.map((s) => ({ b: s.beneficiary, a: s.amountPaise, st: s.settlementStatus, store: s.storeId?.slice(-6) }))))
  const tickets = await db.storeTicket.findMany({ where: { orderId: last.orderId }, select: { storeId: true, subtotalPaise: true, status: true } })
  console.log('tickets:', JSON.stringify(tickets.map((t) => ({ store: t.storeId.slice(-6), sub: t.subtotalPaise, st: t.status }))))
  const items = await db.orderItem.findMany({ where: { orderId: last.orderId }, select: { nameSnapshot: true, storeId: true, lineTotalPaise: true, taxRatePct: true } })
  console.log('items:', JSON.stringify(items))
}
await db.$disconnect()
