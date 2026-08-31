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
  } catch {
    return []
  }
}

export function ordersForSeat(seatToken: string): RememberedOrder[] {
  return readAll().filter((o) => o.seatToken === seatToken)
}

export function forgetOrder(code: string): void {
  try {
    const norm = code.trim().toUpperCase()
    localStorage.setItem(KEY, JSON.stringify(readAll().filter((o) => o.code !== norm)))
  } catch {
    // ignore
  }
}
