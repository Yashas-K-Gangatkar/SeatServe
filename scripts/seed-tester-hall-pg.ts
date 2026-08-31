/**
 * SeatServe — seed the Tester Hall into PRODUCTION Postgres.
 * Same logic as scripts/seed-tester-hall.ts but against the Postgres client
 * generated at prisma/pg-client and DATABASE_URL from .env.secrets
 * (CLOUD_POSTGRES_URL). Token-stable via the SAME manifest, so the printed
 * sticker kit works identically here and on prod.
 *
 * Run:  bash scripts/seed-tester-hall-prod.sh  (or: bun scripts/seed-tester-hall-pg.ts)
 */
import { PrismaClient } from '../prisma/pg-client/client'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { generateQrToken } from '../src/lib/ids'

const MANIFEST = new URL('./tester-hall-manifest.json', import.meta.url).pathname
const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
const COLS = 10

async function main() {
  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('postgres'))
    throw new Error('DATABASE_URL must be the prod postgres:// URL — run via seed-tester-hall-prod.sh')

  const db = new PrismaClient()
  const manifest: Record<string, string> = existsSync(MANIFEST)
    ? JSON.parse(readFileSync(MANIFEST, 'utf8'))
    : {}
  let created = 0
  let reused = 0

  const mall = await db.mall.findFirst({ where: { name: 'Aurora Mall' } })
  if (!mall) throw new Error('Aurora Mall not found in prod DB')
  const cinema = await db.cinema.findFirst({ where: { mallId: mall.id, wing: 'A' } })
  if (!cinema) throw new Error('Aurora Cineplex — Wing A not found in prod DB')

  let screen = await db.screen.findFirst({ where: { cinemaId: cinema.id, name: 'Tester Hall' } })
  if (!screen) {
    screen = await db.screen.create({
      data: { cinemaId: cinema.id, name: 'Tester Hall', seatRows: ROWS.length, seatCols: COLS },
    })
    console.log('✚ prod: created screen Tester Hall')
  }

  for (const row of ROWS) {
    for (let n = 1; n <= COLS; n++) {
      const code = `${row}-${n}`
      const existing = await db.seat.findFirst({ where: { screenId: screen.id, code } })
      if (existing) {
        manifest[code] = existing.qrToken
        reused++
        continue
      }
      const token = manifest[code] ?? generateQrToken()
      manifest[code] = token
      await db.seat.create({
        data: { screenId: screen.id, code, rowLabel: row, seatNumber: n, qrToken: token },
      })
      created++
    }
  }

  const activeShows = await db.showtime.findMany({ where: { screenId: screen.id, isActive: true } })
  if (activeShows.length === 0) {
    await db.showtime.create({
      data: {
        screenId: screen.id,
        movieTitle: 'Tester Day — Open Show',
        language: 'Hindi',
        startsAt: new Date(Date.now() + 2 * 60 * 60_000),
        orderCutoffMinutes: 30,
        demoAutoRoll: true,
      },
    })
    console.log('✚ prod: created rolling showtime (demoAutoRoll=true)')
  }

  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`✅ PROD Tester Hall ready — created: ${created}, reused: ${reused}, total: ${ROWS.length * COLS}`)
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
