import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const o = await db.order.update({ where: { code: 'SS-TDXJJG' }, data: { paymentStatus: 'PAID', status: 'PAID' }, select: { code: true, status: true, paymentStatus: true } })
console.log(JSON.stringify(o))
await db.$disconnect()
