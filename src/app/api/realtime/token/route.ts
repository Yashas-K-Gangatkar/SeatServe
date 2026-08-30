// POST /api/realtime/token { room } → { token, expiresIn }
// Audit fix #18: issues short-lived HMAC room tokens for STAFF realtime rooms.
// The socket.io service refuses staff-room subscribes without a valid token.
// Authorization (server-side, session-derived — never from client params):
//   admin:<mallId>   → MALL_ADMIN of that mall, CINEMA_MANAGER whose cinema is in it
//   runners:<mallId> → RUNNER whose zone is in that mall, MALL_ADMIN of that mall
//   store:<storeId>  → KITCHEN_STAFF / STORE_MANAGER of that store, MALL_ADMIN of its mall
//   order:<code>     → public room (order code = capability) — no token needed
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { signRoomToken } from '@/lib/realtime-auth'

const ROOM_SECRET = process.env.REALTIME_ROOM_SECRET ?? 'sandbox_room_secret_dev_only'
const TTL_SECONDS = 10 * 60

const bodySchema = z.object({ room: z.string().min(3).max(120) })

export async function POST(request: Request) {
  const auth = await requireStaff(request)
  if ('error' in auth) return auth.error
  const user = auth.user

  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error
  const room = parsed.data.room

  const [kind, scoped] = room.split(':')
  if (kind === 'order') return fail('Order rooms are public — subscribe directly', 400)

  let allowed = false
  if (kind === 'admin') {
    if (user.role === 'MALL_ADMIN') allowed = scoped === user.mallId
    else if (user.role === 'CINEMA_MANAGER' && user.cinemaId) {
      const cinema = await db.cinema.findUnique({ where: { id: user.cinemaId }, select: { mallId: true } })
      allowed = cinema?.mallId === scoped
    }
  } else if (kind === 'runners') {
    if (user.role === 'MALL_ADMIN') allowed = scoped === user.mallId
    else if (user.role === 'RUNNER' && user.runnerId) {
      const runner = await db.runner.findUnique({ where: { id: user.runnerId }, include: { zone: true } })
      allowed = runner?.zone?.mallId === scoped
    }
  } else if (kind === 'store') {
    if (user.role === 'KITCHEN_STAFF' || user.role === 'STORE_MANAGER') allowed = scoped === user.storeId
    else if (user.role === 'MALL_ADMIN') {
      const store = await db.store.findUnique({ where: { id: scoped }, select: { mallId: true } })
      allowed = store?.mallId === user.mallId
    }
  }

  if (!allowed) return fail('You are not authorized for this realtime room', 403)

  const token = signRoomToken({ r: room, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS, u: user.id }, ROOM_SECRET)
  return ok({ token, room, expiresIn: TTL_SECONDS })
}
