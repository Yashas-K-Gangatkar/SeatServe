// GET /api/admin/qr?classroomId=<id> — printable seat-QR sheet data (login required).
// QR encodes `<public origin>/?qr=<seatToken>` so a phone camera scan opens
// exactly that seat's ordering page. BLOCK_MANAGER is limited to their own
// block's classrooms; CAMPUS_ADMIN to their campus.
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
  const auth = await requireStaff(request, ['BLOCK_MANAGER', 'CAMPUS_ADMIN'])
  if ('error' in auth) return auth.error
  const user = auth.user

  const url = new URL(request.url)
  const classroomId = url.searchParams.get('classroomId')

  const scopeWhere =
    user.role === 'CAMPUS_ADMIN'
      ? { block: { campusId: user.campusId ?? '__none__' } }
      : { blockId: user.blockId ?? '__none__' }

  const classrooms = await db.classroom.findMany({
    where: scopeWhere,
    include: { block: true, _count: { select: { seats: true } } },
    orderBy: { name: 'asc' },
  })
  const classroom = classroomId ? classrooms.find((s) => s.id === classroomId) : classrooms[0]
  if (!classroom) return fail('Classroom not found (or outside your scope)', 404)

  const seats = await db.seat.findMany({
    where: { classroomId: classroom.id },
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
    classrooms: classrooms.map((s) => ({ id: s.id, name: s.name, block: s.block.name, seatsCount: s._count.seats })),
    classroom: { id: classroom.id, name: classroom.name, block: classroom.block.name },
    seats: seatData,
  })
}
