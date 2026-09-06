// GET /api/demo/entry — SANDBOX ONLY.
// Audit fix #15 made seat QR tokens random (they are capabilities: a
// guessable token let anyone order to / read another seat). This endpoint
// gives the landing page, README verification and CI scripts the CURRENT
// demo tokens after every reseed, so nothing needs predictable tokens.
// PRODUCTION: hard-404 — handing out valid seat capability tokens on the live
// platform would let anyone order to a seat without scanning the physical QR.
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'

export async function GET() {
  if (process.env.NODE_ENV === 'production') return fail('Not found', 404)
  const heroSeat = await db.seat.findFirst({
    where: { classroom: { name: { in: ['Classroom 3', 'Screen 3'] } }, code: 'A-1' },
    select: { qrToken: true, code: true, classroom: { select: { name: true, block: { select: { campus: { select: { name: true } } } } } } },
  })
  const blockedSeat = await db.seat.findFirst({
    where: { classroom: { name: { in: ['Classroom 1', 'Screen 1'] } }, code: 'A-1' },
    select: { qrToken: true, code: true, classroom: { select: { name: true } } },
  })
  const nexoraSeat = await db.seat.findFirst({
    where: { classroom: { name: { in: ['Nexora Classroom 1', 'Nexora Screen 1'] } }, code: 'A-1' },
    select: { qrToken: true, code: true, classroom: { select: { name: true, block: { select: { campus: { select: { name: true } } } } } } },
  })

  return ok({
    aurora: heroSeat
      ? { qrToken: heroSeat.qrToken, seat: heroSeat.code, classroom: heroSeat.classroom.name, campus: heroSeat.classroom.block.campus.name }
      : null,
    auroraBlocked: blockedSeat ? { qrToken: blockedSeat.qrToken, seat: blockedSeat.code, classroom: blockedSeat.classroom.name } : null,
    nexora: nexoraSeat
      ? { qrToken: nexoraSeat.qrToken, seat: nexoraSeat.code, classroom: nexoraSeat.classroom.name, campus: nexoraSeat.classroom.block.campus.name }
      : null,
  })
}
