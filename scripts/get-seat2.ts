import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const s = await db.seat.findFirst({ where: { code: 'A-1', screen: { name: 'Screen 2' } }, include: { screen: true } })
console.log(`seat ${s?.code} screen=${s?.screen.name} token=${s?.qrToken}`)
await db.$disconnect()
