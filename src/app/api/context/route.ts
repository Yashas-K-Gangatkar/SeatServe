// GET /api/context?qr=<seatToken>
// The QR endpoint: resolves a printed seat QR to everything the customer page needs.
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'
import { pickCurrentShow } from '@/lib/showtime'
import { getSettings } from '@/lib/settings'
import { rollStaleShowtimes } from '@/lib/demo-roll'

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
        },
      },
    },
  })
  if (!seat) return fail('Unknown seat QR. Please scan the QR printed at your seat.', 404)

  // Sandbox demo guardian: keep stale showtimes usable (see lib/demo-roll.ts)
  await rollStaleShowtimes(seat.screenId)
  const showtimes = await db.showtime.findMany({
    where: { screenId: seat.screenId, isActive: true },
    orderBy: { startsAt: 'asc' },
  })

  const now = new Date()
  // Audit fix #20: same selection rule as /api/orders so the UI can never
  // advertise a show the order API would reject (and vice versa).
  const picked = pickCurrentShow(showtimes, now)
  const currentShow = picked.show
  const cutoff = picked.info

  const settings = await getSettings()

  // Audit fix #13: return ONLY stores inside the seat's mall. The old query
  // returned every store on the platform (cross-mall leak — and with the
  // second seed mall it would have let an Aurora seat order from Nexora).
  const stores = await db.store.findMany({
    where: { mallId: seat.screen.cinema.mallId },
    orderBy: { name: 'asc' },
    include: { products: { orderBy: [{ category: 'asc' }, { name: 'asc' }] } },
  })

  // FSSAI display rule: a food business's license number is shown to customers
  // ONLY once the mall admin has KYC-VERIFIED the store (a pending/fake store
  // can never borrow credibility). The 14-digit shape is re-validated here so
  // a malformed legacy KYC payload can never leak into the customer UI.
  const fssaiOf = (s: (typeof stores)[number]): string | null => {
    if (s.kycStatus !== 'VERIFIED' || !s.kycDetail) return null
    try {
      const d = JSON.parse(s.kycDetail) as { fssai?: unknown }
      return typeof d.fssai === 'string' && /^\d{14}$/.test(d.fssai) ? d.fssai : null
    } catch {
      return null
    }
  }

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
      fssai: fssaiOf(s),
      rating: s.rating,
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
        imageUrl: p.imageUrl,
        isAvailable: p.isAvailable,
      })),
    })),
    screenSeats,
    settings: { platformFeePct: settings.platformFeePct, walkBufferMin: settings.walkBufferMin, paymentFeePct: settings.paymentFeePct },
    serverTime: now.toISOString(),
  })
}
