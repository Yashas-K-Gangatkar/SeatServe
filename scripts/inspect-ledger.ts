import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const orders = await db.order.findMany({ orderBy: { placedAt: 'desc' }, take: 4, include: { tickets: { include: { store: true } } } })
const withCancel = orders.find((o) => o.tickets.some((t) => t.status === 'CANCELLED')) ?? orders[0]
if (withCancel) {
  const splits = await db.split.findMany({ where: { orderId: withCancel.id }, orderBy: { createdAt: 'asc' } })
  console.log('order:', withCancel.code)
  console.log('splits:', JSON.stringify(splits.map((s) => ({ b: s.beneficiary, a: s.amountPaise, st: s.settlementStatus, store: s.storeId?.slice(-6) }))))
  console.log('tickets:', JSON.stringify(withCancel.tickets.map((t) => ({ store: t.storeId.slice(-6), sub: t.subtotalPaise, st: t.status }))))
}
await db.$disconnect()
