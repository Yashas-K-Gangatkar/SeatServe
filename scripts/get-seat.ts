import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const seats = await db.seat.findMany({ take: 3, include: { classroom: { include: { block: true } } } })
for (const s of seats) console.log(`${s.code} token=${s.qrToken} classroom=${s.classroom.name} block=${s.classroom.block.name}`)
await db.$disconnect()
