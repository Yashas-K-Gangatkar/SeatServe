// SeatServe — realtime room authorization tokens (pure, unit-testable).
//
// Audit fix #18: the socket.io hub accepted `subscribe` for ANY room from ANY
// connection — an anonymous browser could join `admin` / `store:<id>` /
// `runners` and receive ticket & order events. Now:
//   • staff rooms are mall-scoped by name: admin:<mallId>, runners:<mallId>,
//     store:<storeId> (unchanged shape)
//   • joining one requires an HMAC-SHA256 token minted by /api/realtime/token
//     AFTER requireStaff() has checked role + tenant scope
//   • customer rooms order:<orderCode> stay open — the unguessable order code
//     is the capability (same trust level as the public tracking API)
import { createHmac, timingSafeEqual } from 'node:crypto'

export interface RoomTokenPayload {
  /** room the bearer may join */
  r: string
  /** expiry, epoch seconds */
  exp: number
  /** issuing staff user id (audit) */
  u?: string
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

export function signRoomToken(payload: RoomTokenPayload, secret: string): string {
  const body = b64url(JSON.stringify(payload))
  const sig = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyRoomToken(token: string, secret: string, room: string, now: number = Date.now()): RoomTokenPayload | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as RoomTokenPayload
    if (typeof payload.r !== 'string' || typeof payload.exp !== 'number') return null
    if (payload.r !== room) return null
    if (payload.exp * 1000 < now) return null
    return payload
  } catch {
    return null
  }
}

/** Staff rooms that require a token. Order rooms (order:<code>) are public. */
export function isStaffRoom(room: string): boolean {
  return room.startsWith('admin:') || room.startsWith('runners:') || room.startsWith('store:')
}
