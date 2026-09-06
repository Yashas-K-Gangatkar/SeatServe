// GET /api/context?qr=<seatToken | classroomDoorToken>
// The QR endpoint: resolves a printed QR to everything the customer page
// needs. Two scan types since the campus pivot:
//   • seat QR (seat-sticker style) → mode: 'seat'
//   • classroom DOOR QR (campus-style, one sticker per room) → mode: 'door'
//     (seat: null — the student types their seat/roll label at checkout)
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'
import { pickCurrentShow } from '@/lib/lecture'
import { getSettings } from '@/lib/settings'
import { rollStaleShowtimes } from '@/lib/demo-roll'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const qr = url.searchParams.get('qr')?.trim()
  if (!qr) return fail('Missing ?qr= token', 400)

  const seat = await db.seat.findUnique({
    where: { qrToken: qr },
    include: {
      classroom: {
        include: {
          block: { include: { campus: true } },
        },
      },
    },
  })
  const classroom =
    seat?.classroom ??
    (await db.classroom.findUnique({
      where: { doorQrToken: qr },
      include: { block: { include: { campus: true } } },
    }))
  if (!classroom) return fail('Unknown QR. Please scan the QR at your seat or on your classroom door.', 404)

  // Sandbox demo guardian: keep stale lectures usable (see lib/demo-roll.ts)
  await rollStaleShowtimes(classroom.id)
  const lectures = await db.lecture.findMany({
    where: { classroomId: classroom.id, isActive: true },
    orderBy: { startsAt: 'asc' },
  })

  const now = new Date()
  // Audit fix #20: same selection rule as /api/orders so the UI can never
  // advertise a show the order API would reject (and vice versa).
  const picked = pickCurrentShow(lectures, now)
  const currentShow = picked.show
  const cutoff = picked.info

  const settings = await getSettings()

  // Audit fix #13: return ONLY stores inside the seat's campus. The old query
  // returned every store on the platform (cross-campus leak — and with the
  // second seed campus it would have let an Aurora seat order from Nexora).
  const stores = await db.store.findMany({
    where: { campusId: classroom.block.campusId },
    orderBy: { name: 'asc' },
    include: { products: { orderBy: [{ category: 'asc' }, { name: 'asc' }] } },
  })

  // FSSAI display rule: a food business's license number is shown to customers
  // ONLY once the campus admin has KYC-VERIFIED the store (a pending/fake store
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

  const classroomSeats = await db.seat.findMany({
    where: { classroomId: classroom.id },
    orderBy: [{ rowLabel: 'asc' }, { seatNumber: 'asc' }],
    select: { code: true, qrToken: true },
  })

  return ok({
    mode: seat ? ('seat' as const) : ('door' as const),
    campus: { id: classroom.block.campus.id, name: classroom.block.campus.name, city: classroom.block.campus.city },
    block: { id: classroom.block.id, name: classroom.block.name, wing: classroom.block.wing },
    classroom: { id: classroom.id, name: classroom.name },
    seat: seat ? { id: seat.id, code: seat.code, qrToken: seat.qrToken } : null,
    lecture: currentShow
      ? {
          id: currentShow.id,
          subject: currentShow.subject,
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
    classroomSeats,
    settings: { platformFeePct: settings.platformFeePct, walkBufferMin: settings.walkBufferMin, paymentFeePct: settings.paymentFeePct },
    serverTime: now.toISOString(),
  })
}
