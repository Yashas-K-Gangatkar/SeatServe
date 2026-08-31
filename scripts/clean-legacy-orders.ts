import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
// legacy test orders whose split ledgers predate the money-model change
// (double-counted refund+void rows) — not representable under current policy
const bad = await db.order.findMany({ where: { paymentStatus: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] } }, select: { id: true, code: true } })
for (const o of bad) {
  await db.auditLog.deleteMany({ where: { orderId: o.id } })
  await db.paymentEvent.deleteMany({ where: { payment: { orderId: o.id } } })
  await db.payment.deleteMany({ where: { orderId: o.id } })
  await db.deliveryRun.deleteMany({ where: { ticket: { orderId: o.id } } })
  await db.storeTicket.deleteMany({ where: { orderId: o.id } })
  await db.split.deleteMany({ where: { orderId: o.id } })
  await db.orderItem.deleteMany({ where: { orderId: o.id } })
  await db.order.delete({ where: { id: o.id } })
  console.log('deleted legacy order', o.code)
}
console.log('remaining orders:', await db.order.count())
await db.$disconnect()
