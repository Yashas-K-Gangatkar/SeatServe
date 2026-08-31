/**
 * SeatServe — Tester Hall seeder (idempotent, token-stable).
 *
 * Creates (or reuses) a dedicated "Tester Hall" screen under
 * Aurora Cineplex — Wing A with a 10×10 seat grid (rows A–J × seats 1–10,
 * 100 seats). Every seat gets a UNIQUE QR token taken from
 * scripts/tester-hall-manifest.json — the manifest is created on first run
 * and REUSED afterwards, so printed QR stickers never die across reseeds
 * or re-runs here and on production.
 *
 * Why a manifest: QR tokens are random (a printed QR is a capability —
 * see prisma/seed.ts note). The printed sticker kit must keep working
 * forever, so the token per seat is frozen in the manifest file. The
 * manifest intentionally stays OUT of git — keep it next to the printed kit.
 *
 * Showtime: one active show, demoAutoRoll=true — the demo-roll guardian
 * (rollStaleShowtimes) keeps ordering open forever, exactly like Screen 3.
 *
 * Run (sandbox SQLite):  bun scripts/seed-tester-hall.ts
 * Run (production):      see scripts/seed-tester-hall-prod.mjs
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { generateQrToken } from '../src/lib/ids'

const MANIFEST = new URL('./tester-hall-manifest.json', import.meta.url).pathname
const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
const COLS = 10

type Manifest = Record<string, string> // seat code -> qr token

function loadManifest(): Manifest {
  if (existsSync(MANIFEST)) return JSON.parse(readFileSync(MANIFEST, 'utf8'))
  return {}
}

async function main() {
  const db = new PrismaClient()
  const manifest = loadManifest()
  let created = 0
  let reused = 0

  const mall = await db.mall.findFirst({ where: { name: 'Aurora Mall' } })
  if (!mall) throw new Error('Aurora Mall not found — run the demo seed first (bun run db:seed)')
  const cinema = await db.cinema.findFirst({ where: { mallId: mall.id, wing: 'A' } })
  if (!cinema) throw new Error('Aurora Cineplex — Wing A not found')

  let screen = await db.screen.findFirst({ where: { cinemaId: cinema.id, name: 'Tester Hall' } })
  if (!screen) {
    screen = await db.screen.create({
      data: { cinemaId: cinema.id, name: 'Tester Hall', seatRows: ROWS.length, seatCols: COLS },
    })
    console.log('✚ created screen Tester Hall')
  }

  for (const row of ROWS) {
    for (let n = 1; n <= COLS; n++) {
      const code = `${row}-${n}`
      const existing = await db.seat.findFirst({ where: { screenId: screen.id, code } })
      if (existing) {
        // keep the DB token authoritative; freeze it into the manifest
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

  // Showtime — reuse an upcoming/active one if present, else create a rolling one.
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
    console.log('✚ created rolling showtime (demoAutoRoll=true)')
  } else {
    console.log(`= ${activeShows.length} active showtime(s) already on Tester Hall`)
  }

  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`✅ Tester Hall ready — seats created: ${created}, reused: ${reused}, total: ${ROWS.length * COLS}`)
  console.log(`   manifest: ${MANIFEST}`)
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
