import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const seats = await db.seat.findMany({ take: 3, include: { screen: { include: { cinema: true } } } })
for (const s of seats) console.log(`${s.code} token=${s.qrToken} screen=${s.screen.name} cinema=${s.screen.cinema.name}`)
await db.$disconnect()
