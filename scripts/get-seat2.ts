import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const s = await db.seat.findFirst({ where: { code: 'A-1', classroom: { name: 'Classroom 2' } }, include: { classroom: true } })
console.log(`seat ${s?.code} classroom=${s?.classroom.name} token=${s?.qrToken}`)
await db.$disconnect()
