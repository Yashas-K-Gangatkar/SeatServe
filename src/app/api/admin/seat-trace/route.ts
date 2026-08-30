// GET /api/admin/seat-trace?q=<qr token | seat code> — anti-scam seat trace.
//
// Every seat carries a UNIQUE QR token (432 unique tokens per mall set), and
// every order permanently records the seat it was placed from. This endpoint
// answers the operational question: "an order/QR in front of seat X looks
// suspicious — which orders came from it, and who claims that seat?"
//
// Access: MALL_ADMIN (whole mall) · CINEMA_MANAGER (their cinema's screens) ·
// STORE_MANAGER (narrow read — seats resolve inside their mall via admin scope).
// Every lookup is audited (SEAT_TRACE) so investigations are on record.

import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { audit } from '@/lib/audit'

export async function GET(request: Request) {
  const auth = await requireStaff(request, ['MALL_ADMIN', 'CINEMA_MANAGER', 'STORE_MANAGER'])
  if ('error' in auth) return auth.error
  const user = auth.user

  const q = new URL(request.url).searchParams.get('q')?.trim().toUpperCase() ?? ''
  if (q.length < 2) return fail('Enter a seat QR token (e.g. A3F12K9PQ2) or a seat code (e.g. F-12)', 400)

  // resolve the seat inside the caller's scope (Screen → Cinema → Mall)
  const screenWhere =
    user.role === 'CINEMA_MANAGER'
      ? { cinemaId: user.cinemaId ?? '__none__' }
      : { cinema: { mallId: user.mallId ?? '__none__' } }

  const candidates = await db.seat.findMany({
    where: {
      OR: [{ qrToken: q }, { code: q }],
      screen: screenWhere,
    },
    include: { screen: { include: { cinema: { include: { mall: true } } } } },
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
    mallId: seat.screen.cinema.mallId,
    meta: { query: q, seatCode: seat.code, screen: seat.screen.name, ordersFound: orders.length },
  })

  return ok({
    seat: {
      id: seat.id,
      code: seat.code,
      qrToken: seat.qrToken,
      screen: seat.screen.name,
      cinema: seat.screen.cinema.name,
      mall: seat.screen.cinema.mall.name,
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
