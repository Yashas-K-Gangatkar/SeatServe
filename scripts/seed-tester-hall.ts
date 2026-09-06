/**
 * NotiFetch — Tester Hall seeder (idempotent, token-stable).
 *
 * Creates (or reuses) a dedicated "Tester Hall" classroom under
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
 * Lecture: one active show, demoAutoRoll=true — the demo-roll guardian
 * (rollStaleShowtimes) keeps ordering open forever, exactly like Classroom 3.
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

  const campus = await db.campus.findFirst({ where: { name: 'Aurora Campus' } })
  if (!campus) throw new Error('Aurora Campus not found — run the demo seed first (bun run db:seed)')
  const block = await db.block.findFirst({ where: { campusId: campus.id, wing: 'A' } })
  if (!block) throw new Error('Aurora Cineplex — Wing A not found')

  let classroom = await db.classroom.findFirst({ where: { blockId: block.id, name: 'Tester Hall' } })
  if (!classroom) {
    classroom = await db.classroom.create({
      data: { blockId: block.id, name: 'Tester Hall', seatRows: ROWS.length, seatCols: COLS },
    })
    console.log('✚ created classroom Tester Hall')
  }

  for (const row of ROWS) {
    for (let n = 1; n <= COLS; n++) {
      const code = `${row}-${n}`
      const existing = await db.seat.findFirst({ where: { classroomId: classroom.id, code } })
      if (existing) {
        // keep the DB token authoritative; freeze it into the manifest
        manifest[code] = existing.qrToken
        reused++
        continue
      }
      const token = manifest[code] ?? generateQrToken()
      manifest[code] = token
      await db.seat.create({
        data: { classroomId: classroom.id, code, rowLabel: row, seatNumber: n, qrToken: token },
      })
      created++
    }
  }

  // Lecture — reuse an upcoming/active one if present, else create a rolling one.
  const activeShows = await db.lecture.findMany({ where: { classroomId: classroom.id, isActive: true } })
  if (activeShows.length === 0) {
    await db.lecture.create({
      data: {
        classroomId: classroom.id,
        subject: 'Tester Day — Open Show',
        language: 'Hindi',
        startsAt: new Date(Date.now() + 2 * 60 * 60_000),
        orderCutoffMinutes: 30,
        demoAutoRoll: true,
      },
    })
    console.log('✚ created rolling lecture (demoAutoRoll=true)')
  } else {
    console.log(`= ${activeShows.length} active lecture(s) already on Tester Hall`)
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
