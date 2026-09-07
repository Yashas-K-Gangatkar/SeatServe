// GET /api/demo/entry — SANDBOX ONLY.
// Audit fix #15 made seat QR tokens random (they are capabilities: a
// guessable token let anyone order to / read another seat). This endpoint
// gives the landing page, README verification and CI scripts the CURRENT
// demo tokens after every reseed, so nothing needs predictable tokens.
// PRODUCTION: hard-404 — handing out valid seat capability tokens on the live
// platform would let anyone order to a seat without scanning the physical QR.
//
// Campus-agnostic (the old shape hardcoded "Aurora"/"Nexora" room names and
// broke on any other seed): keys are demo / demoBlocked / demoAlt.
//   demo       — A-1 seat of the first classroom on the platform
//   demoBlocked— A-1 seat of a room with a past-cutoff demo lecture when one
//                exists (the "ordering closed" demo), else the second room
//   demoAlt    — A-1 seat of a DIFFERENT campus (multi-tenant isolation demo),
//                null when the platform has a single campus
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'

type SeatInfo = { qrToken: string; code: string; classroom: string; campus?: string }

export async function GET() {
  if (process.env.NODE_ENV === 'production') return fail('Not found', 404)

  const rooms = await db.classroom.findMany({
    orderBy: { createdAt: 'asc' },
    take: 20,
    select: { id: true, name: true, block: { select: { campus: { select: { id: true, name: true } } } } },
  })
  if (rooms.length === 0) return ok({ demo: null, demoBlocked: null, demoAlt: null })

  const seats = await db.seat.findMany({
    where: { classroomId: { in: rooms.map((r) => r.id) }, code: 'A-1' },
    select: { qrToken: true, code: true, classroomId: true },
  })
  const seatOf = (roomId: string): SeatInfo | null => {
    const s = seats.find((x) => x.classroomId === roomId)
    if (!s) return null
    const room = rooms.find((r) => r.id === roomId)!
    return { qrToken: s.qrToken, code: s.code, classroom: room.name, campus: room.block.campus.name }
  }

  // demo: first room that actually has an A-1 seat
  const demoRoom = rooms.find((r) => seatOf(r.id))
  const demo = demoRoom ? seatOf(demoRoom.id) : null

  // demoBlocked: prefer a room with a past-cutoff, never-rolled demo lecture
  const blockedLecture = await db.lecture.findFirst({
    where: { demoAutoRoll: false, isActive: true },
    orderBy: { startsAt: 'asc' },
    select: { classroomId: true },
  })
  const blockedRoom =
    (blockedLecture && rooms.find((r) => r.id === blockedLecture.classroomId && seatOf(r.id))) ??
    rooms.find((r) => r.id !== demoRoom?.id && seatOf(r.id)) ??
    null
  const demoBlocked = blockedRoom ? seatOf(blockedRoom.id) : null
  if (demoBlocked) delete (demoBlocked as { campus?: string }).campus

  // demoAlt: an A-1 seat on a DIFFERENT campus than demo (isolation demo)
  const altRoom =
    rooms.find((r) => r.block.campus.id !== demoRoom?.block.campus.id && seatOf(r.id)) ?? null
  const demoAlt = altRoom ? seatOf(altRoom.id) : null

  return ok({ demo, demoBlocked, demoAlt })
}
