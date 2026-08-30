// GET /api/admin/qr?screenId=<id> — printable seat-QR sheet data (login required).
// QR encodes `<public origin>/?qr=<seatToken>` so a phone camera scan opens
// exactly that seat's ordering page. CINEMA_MANAGER is limited to their own
// cinema's screens; MALL_ADMIN to their mall.
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import QRCode from 'qrcode'

function publicOrigin(request: Request): string {
  const proto = request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host
  return `${proto}://${host}`
}

export async function GET(request: Request) {
  const auth = await requireStaff(request, ['CINEMA_MANAGER', 'MALL_ADMIN'])
  if ('error' in auth) return auth.error
  const user = auth.user

  const url = new URL(request.url)
  const screenId = url.searchParams.get('screenId')

  const scopeWhere =
    user.role === 'MALL_ADMIN'
      ? { cinema: { mallId: user.mallId ?? '__none__' } }
      : { cinemaId: user.cinemaId ?? '__none__' }

  const screens = await db.screen.findMany({
    where: scopeWhere,
    include: { cinema: true, _count: { select: { seats: true } } },
    orderBy: { name: 'asc' },
  })
  const screen = screenId ? screens.find((s) => s.id === screenId) : screens[0]
  if (!screen) return fail('Screen not found (or outside your scope)', 404)

  const seats = await db.seat.findMany({
    where: { screenId: screen.id },
    orderBy: [{ rowLabel: 'asc' }, { seatNumber: 'asc' }],
  })

  const origin = publicOrigin(request)
  const seatData = await Promise.all(
    seats.map(async (seat) => {
      const target = `${origin}/?qr=${seat.qrToken}`
      const dataUrl = await QRCode.toDataURL(target, {
        margin: 1,
        width: 220,
        color: { dark: '#101217', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      })
      return { code: seat.code, rowLabel: seat.rowLabel, seatNumber: seat.seatNumber, qrToken: seat.qrToken, target, dataUrl }
    }),
  )

  return ok({
    origin,
    screens: screens.map((s) => ({ id: s.id, name: s.name, cinema: s.cinema.name, seatsCount: s._count.seats })),
    screen: { id: screen.id, name: screen.name, cinema: screen.cinema.name },
    seats: seatData,
  })
}
