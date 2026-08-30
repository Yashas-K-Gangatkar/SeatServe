// SeatServe — showtime selection (pure, shared by /api/context and /api/orders).
//
// Audit fix #20: the old code picked the FIRST show that started within the
// last 3 hours ("current show window") — even when its ordering cutoff had
// already passed — while a perfectly orderable LATER show existed. Customers
// with an open cutoff were wrongly told "Ordering closed".
//
// New rule (shows sorted ascending):
//   1. the earliest show whose ordering cutoff is still OPEN  → normal case
//   2. none open → the earliest show inside the 3h current-show window
//      (drives the blocked-state demo and its 423 message; no silent
//      jumping to a future show whose cutoff is also closed)
import { cutoffInfo, type CutoffInfo } from './cutoff'

/** Keep in sync with CURRENT_SHOW_WINDOW_MIN in lib/demo-roll.ts */
export const CURRENT_SHOW_WINDOW_MIN = 180

export interface ShowtimeLike {
  id: string
  movieTitle: string
  language?: string | null
  startsAt: Date | string
  orderCutoffMinutes: number
}

export interface CurrentShow<T extends ShowtimeLike> {
  show: T | null
  info: CutoffInfo | null
  /** why this show was chosen — for logs and clearer API errors */
  reason: 'ordering-open' | 'blocked-cutoff' | 'none-in-window'
}

export function pickCurrentShow<T extends ShowtimeLike>(showtimes: T[], now: Date): CurrentShow<T> {
  const windowStart = now.getTime() - CURRENT_SHOW_WINDOW_MIN * 60_000
  const candidates = showtimes
    .filter((s) => new Date(s.startsAt).getTime() > windowStart)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  if (candidates.length === 0) return { show: null, info: null, reason: 'none-in-window' }

  const open = candidates.find((s) => cutoffInfo(new Date(s.startsAt), s.orderCutoffMinutes, now).orderingOpen)
  if (open) {
    return { show: open, info: cutoffInfo(new Date(open.startsAt), open.orderCutoffMinutes, now), reason: 'ordering-open' }
  }

  return {
    show: candidates[0],
    info: cutoffInfo(new Date(candidates[0].startsAt), candidates[0].orderCutoffMinutes, now),
    reason: 'blocked-cutoff',
  }
}
