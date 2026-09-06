// GET /api/admin/seat-trace?q=<qr token | seat code> — anti-scam seat trace.
//
// Every seat carries a UNIQUE QR token (432 unique tokens per campus set), and
// every order permanently records the seat it was placed from. This endpoint
// answers the operational question: "an order/QR in front of seat X looks
// suspicious — which orders came from it, and who claims that seat?"
//
// Access: CAMPUS_ADMIN (whole campus) · BLOCK_MANAGER (their block's classrooms) ·
// STORE_MANAGER (narrow read — seats resolve inside their campus via admin scope).
// Every lookup is audited (SEAT_TRACE) so investigations are on record.

import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { audit } from '@/lib/audit'

export async function GET(request: Request) {
  const auth = await requireStaff(request, ['CAMPUS_ADMIN', 'BLOCK_MANAGER', 'STORE_MANAGER'])
  if ('error' in auth) return auth.error
  const user = auth.user

  const q = new URL(request.url).searchParams.get('q')?.trim().toUpperCase() ?? ''
  if (q.length < 2) return fail('Enter a seat QR token (e.g. A3F12K9PQ2) or a seat code (e.g. F-12)', 400)

  // resolve the seat inside the caller's scope (Classroom → Block → Campus)
  const screenWhere =
    user.role === 'BLOCK_MANAGER'
      ? { blockId: user.blockId ?? '__none__' }
      : { block: { campusId: user.campusId ?? '__none__' } }

  const candidates = await db.seat.findMany({
    where: {
      OR: [{ qrToken: q }, { code: q }],
      classroom: screenWhere,
    },
    include: { classroom: { include: { block: { include: { campus: true } } } } },
    take: 5,
  })

  if (candidates.length === 0) {
    return fail('No seat matches that QR token or seat code in your scope', 404)
  }

  const seat = candidates[0]

  const orders = await db.order.findMany({
    where: { seatId: seat.id },
    include: { tickets: { include: { store: { select: { name: true, emoji: true } } } } },
    orderBy: { placedAt: 'desc' },
    take: 25,
  })

  await audit({
    actorRole: user.role,
    actorRef: user.id,
    action: 'SEAT_TRACE',
    entityType: 'Seat',
    entityId: seat.id,
    campusId: seat.classroom.block.campusId,
    meta: { query: q, seatCode: seat.code, classroom: seat.classroom.name, ordersFound: orders.length },
  })

  return ok({
    seat: {
      id: seat.id,
      code: seat.code,
      qrToken: seat.qrToken,
      classroom: seat.classroom.name,
      block: seat.classroom.block.name,
      campus: seat.classroom.block.campus.name,
    },
    orders: orders.map((o) => ({
      code: o.code,
      placedAt: o.placedAt,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      status: o.status,
      paymentStatus: o.paymentStatus,
      totalPaise: o.totalPaise,
      stores: o.tickets.map((t) => ({ name: t.store.name, emoji: t.store.emoji, status: t.status })),
    })),
  })
}
