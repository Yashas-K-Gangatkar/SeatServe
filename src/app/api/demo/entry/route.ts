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
    where: { screen: { name: 'Screen 3' }, code: 'A-1' },
    select: { qrToken: true, code: true, screen: { select: { name: true, cinema: { select: { mall: { select: { name: true } } } } } } },
  })
  const blockedSeat = await db.seat.findFirst({
    where: { screen: { name: 'Screen 1' }, code: 'A-1' },
    select: { qrToken: true, code: true, screen: { select: { name: true } } },
  })
  const nexoraSeat = await db.seat.findFirst({
    where: { screen: { name: 'Nexora Screen 1' }, code: 'A-1' },
    select: { qrToken: true, code: true, screen: { select: { name: true, cinema: { select: { mall: { select: { name: true } } } } } } },
  })

  return ok({
    aurora: heroSeat
      ? { qrToken: heroSeat.qrToken, seat: heroSeat.code, screen: heroSeat.screen.name, mall: heroSeat.screen.cinema.mall.name }
      : null,
    auroraBlocked: blockedSeat ? { qrToken: blockedSeat.qrToken, seat: blockedSeat.code, screen: blockedSeat.screen.name } : null,
    nexora: nexoraSeat
      ? { qrToken: nexoraSeat.qrToken, seat: nexoraSeat.code, screen: nexoraSeat.screen.name, mall: nexoraSeat.screen.cinema.mall.name }
      : null,
  })
}
