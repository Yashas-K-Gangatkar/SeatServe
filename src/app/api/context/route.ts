// GET /api/context?qr=<seatToken>
// The QR endpoint: resolves a printed seat QR to everything the customer page needs.
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'
import { cutoffInfo } from '@/lib/cutoff'
import { getSettings } from '@/lib/settings'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const qr = url.searchParams.get('qr')?.trim()
  if (!qr) return fail('Missing ?qr= seat token', 400)

  const seat = await db.seat.findUnique({
    where: { qrToken: qr },
    include: {
      screen: {
        include: {
          cinema: { include: { mall: true } },
          showtimes: { where: { isActive: true }, orderBy: { startsAt: 'asc' } },
        },
      },
    },
  })
  if (!seat) return fail('Unknown seat QR. Please scan the QR printed at your seat.', 404)

  const now = new Date()
  const upcoming = seat.screen.showtimes.filter((s) => new Date(s.startsAt).getTime() > now.getTime() - 3 * 3600_000)
  const currentShow = upcoming[0] ?? null

  const settings = await getSettings()
  const cutoff = currentShow ? cutoffInfo(new Date(currentShow.startsAt), currentShow.orderCutoffMinutes, now) : null

  const stores = await db.store.findMany({
    orderBy: { name: 'asc' },
    include: { products: { orderBy: [{ category: 'asc' }, { name: 'asc' }] } },
  })

  const screenSeats = await db.seat.findMany({
    where: { screenId: seat.screenId },
    orderBy: [{ rowLabel: 'asc' }, { seatNumber: 'asc' }],
    select: { code: true, qrToken: true },
  })

  return ok({
    mall: { id: seat.screen.cinema.mall.id, name: seat.screen.cinema.mall.name, city: seat.screen.cinema.mall.city },
    cinema: { id: seat.screen.cinema.id, name: seat.screen.cinema.name, wing: seat.screen.cinema.wing },
    screen: { id: seat.screen.id, name: seat.screen.name },
    seat: { id: seat.id, code: seat.code, qrToken: seat.qrToken },
    showtime: currentShow
      ? {
          id: currentShow.id,
          movieTitle: currentShow.movieTitle,
          language: currentShow.language,
          startsAt: currentShow.startsAt,
          cutoff: {
            orderingOpen: cutoff!.orderingOpen,
            cutoffAt: cutoff!.cutoffAt,
            minutesUntilCutoff: cutoff!.minutesUntilCutoff,
            minutesUntilShow: cutoff!.minutesUntilShow,
          },
        }
      : null,
    stores: stores.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      emoji: s.emoji,
      tagline: s.tagline,
      isOpen: s.isOpen,
      kycStatus: s.kycStatus,
      rating: s.rating,
      deliveryFeePaise: s.deliveryFeePaise,
      prepBufferMin: s.prepBufferMin,
      products: s.products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        category: p.category,
        pricePaise: p.pricePaise,
        taxRatePct: p.taxRatePct,
        prepEstimateMin: p.prepEstimateMin,
        isVeg: p.isVeg,
        allergens: p.allergens,
        isAvailable: p.isAvailable,
      })),
    })),
    screenSeats,
    settings: { platformFee: settings.platformFee, paymentFeePct: settings.paymentFeePct },
    serverTime: now.toISOString(),
  })
}
