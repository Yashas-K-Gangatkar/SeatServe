<<<<<<< HEAD
// SeatServe — remembers orders placed from THIS seat on THIS device.
// A re-scan of the seat QR then shows "Your orders" straight on the seat
// page — the customer never needs to have copied the tracking code.
// Best-effort by design: private mode / cleared storage just means the
// fallback (typing the code) still works.
export interface RememberedOrder {
  code: string
  seatToken: string
  placedAt: number
}

const KEY = 'seatserve.myorders.v1'
const MAX = 12

export function rememberOrder(code: string, seatToken: string): void {
  try {
    const norm = code.trim().toUpperCase()
    if (!norm) return
    const list = readAll().filter((o) => o.code !== norm)
    list.unshift({ code: norm, seatToken, placedAt: Date.now() })
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    // storage unavailable (private mode, quota) — memory is best-effort
  }
}

export function readAll(): RememberedOrder[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (o): o is RememberedOrder =>
        !!o && typeof o === 'object' && typeof (o as RememberedOrder).code === 'string' && typeof (o as RememberedOrder).seatToken === 'string',
    )
=======
// SeatServe — device-local order memory (the customer's "I forgot to copy the
// tracking number" safety net).
//
// Model: the PHYSICAL seat QR is shared by everyone in that seat, so the server
// must never list a seat's orders publicly. Instead, each DEVICE remembers the
// orders it placed (localStorage — survives close/reopen of the browser, stays
// on the phone). When the customer re-scans the seat sticker, the seat page
// reads this memory and offers one-tap tracking. No account, no PII, nothing
// another person scanning the same sticker can see.

const KEY = 'seatserve.orders.v1'
const MAX_ENTRIES = 30
const MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24h — after that the sticker memory clears itself

export interface RememberedOrder {
  code: string
  seatToken: string
  seatCode: string
  screenName: string
  cinemaName?: string
  placedAt: number
}

function readAll(): RememberedOrder[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as RememberedOrder[]
    if (!Array.isArray(arr)) return []
    const now = Date.now()
    return arr
      .filter((o) => o && typeof o.code === 'string' && typeof o.placedAt === 'number' && now - o.placedAt < MAX_AGE_MS)
      .sort((a, b) => b.placedAt - a.placedAt)
      .slice(0, MAX_ENTRIES)
>>>>>>> origin/main
  } catch {
    return []
  }
}

<<<<<<< HEAD
=======
function writeAll(list: RememberedOrder[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)))
  } catch {
    // storage full/blocked — order memory is a convenience, never a hard failure
  }
}

/** Remember an order this device just placed (deduped by code, newest first). */
export function rememberOrder(order: Omit<RememberedOrder, 'placedAt'>): void {
  const list = readAll().filter((o) => o.code !== order.code)
  list.unshift({ ...order, placedAt: Date.now() })
  writeAll(list)
}

/** Orders this DEVICE placed at a specific seat (newest first). */
>>>>>>> origin/main
export function ordersForSeat(seatToken: string): RememberedOrder[] {
  return readAll().filter((o) => o.seatToken === seatToken)
}

<<<<<<< HEAD
export function forgetOrder(code: string): void {
  try {
    const norm = code.trim().toUpperCase()
    localStorage.setItem(KEY, JSON.stringify(readAll().filter((o) => o.code !== norm)))
  } catch {
    // ignore
  }
=======
/** All orders this device placed anywhere, newest first (tracking-page shortcut). */
export function recentOrders(limit = 3): RememberedOrder[] {
  return readAll().slice(0, limit)
}

/** Drop a single order (e.g. customer taps "not my order"). */
export function forgetOrder(code: string): void {
  writeAll(readAll().filter((o) => o.code !== code))
>>>>>>> origin/main
}
