import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const code = process.argv[2] ?? 'SS-TDXJJG'
const o = await db.order.update({ where: { code }, data: { paymentStatus: 'INITIATED', status: 'PLACED' }, select: { code: true, status: true, paymentStatus: true } })
console.log(JSON.stringify(o))
await db.$disconnect()
