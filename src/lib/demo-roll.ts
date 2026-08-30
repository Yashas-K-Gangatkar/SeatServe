// SeatServe — SANDBOX DEMO guardian (Phase 1 only, removed in Phase 2/4).
//
// Problem: seeded showtimes are relative to "seed time". A few real hours later
// every show has started, every ordering cutoff has passed, and the customer
// demo dead-ends ("Ordering closed") through no fault of the caller.
//
// Fix: before resolving a showtime (GET /api/context, POST /api/orders) we roll
// stale showtimes forward:
//   • demoAutoRoll = true  → show already started  → starts at now + ROLL_AHEAD_MIN
//     (ordering reopens: cutoff is now ~90 minutes away)
//   • demoAutoRoll = false → the intentionally-BLOCKED demo show (Screen 1):
//     once fully stale (past the 3-hour "current show" window) it re-arms to
//     "starts in 20 min" so the blocked-ordering state stays demonstrable.
//
// Business rules are untouched: cutoff math still runs on real wall-clock time.
import { db } from '@/lib/db'

const ROLL_AHEAD_MIN = 120 // reopened show starts 2h from now
const BLOCKED_AHEAD_MIN = 20 // re-armed blocked demo starts 20 min from now
const CURRENT_SHOW_WINDOW_MIN = 180 // must match the "current show" lookback

export async function rollStaleShowtimes(screenId?: string): Promise<void> {
  const now = new Date()
  const scope = screenId ? { screenId } : {}

  // 1 · reopenable shows that have already started → roll ahead
  const stale = await db.showtime.findMany({
    where: { demoAutoRoll: true, isActive: true, startsAt: { lt: now }, ...scope },
    select: { id: true },
  })
  if (stale.length > 0) {
    await db.showtime.updateMany({
      where: { id: { in: stale.map((s) => s.id) } },
      data: { startsAt: new Date(now.getTime() + ROLL_AHEAD_MIN * 60_000) },
    })
  }

  // 2 · the blocked demo show → re-arm once it has fully fallen out of the window
  const blocked = await db.showtime.findMany({
    where: {
      demoAutoRoll: false,
      isActive: true,
      startsAt: { lt: new Date(now.getTime() - CURRENT_SHOW_WINDOW_MIN * 60_000) },
      ...scope,
    },
    select: { id: true },
  })
  if (blocked.length > 0) {
    await db.showtime.updateMany({
      where: { id: { in: blocked.map((s) => s.id) } },
      data: { startsAt: new Date(now.getTime() + BLOCKED_AHEAD_MIN * 60_000) },
    })
  }
}
