import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const rows = await db.order.findMany({ orderBy: { placedAt: 'desc' }, take: 6, select: { code: true, status: true, paymentStatus: true, totalPaise: true } })
console.log(JSON.stringify(rows))
await db.$disconnect()
