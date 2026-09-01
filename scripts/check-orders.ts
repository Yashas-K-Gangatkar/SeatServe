import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const orders = await db.order.findMany({
  include: { items: true, seat: true, payments: true },
  orderBy: { placedAt: 'desc' }, take: 20,
})
console.log(`Total orders: ${await db.order.count()}`)
for (const o of orders) {
  const items = o.items.map(x => `${x.qty}x ${x.nameSnapshot}`).join(', ')
  const pay = o.payments.map(p => p.status).join('|') || 'no-payment'
  console.log(`${o.code} | ${o.status}/${o.paymentStatus} | ₹${(o.totalPaise/100).toFixed(2)} | ${o.seat.code} | ${items} | pay=${pay} | ${o.placedAt.toISOString().slice(0,16)}`)
}
await db.$disconnect()
