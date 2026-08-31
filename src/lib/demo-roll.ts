// SeatServe — SANDBOX DEMO guardian (Phase 1 only, removed in Phase 2/4).
//
// Problem: seeded showtimes are relative to "seed time". A few real hours later
// every show has started, every ordering cutoff has passed, and the customer
// demo dead-ends ("Ordering closed") through no fault of the caller.
//
// Fix: before resolving a showtime (GET /api/context, POST /api/orders) we roll
// stale showtimes forward:
//   1. demoAutoRoll = true AND the ordering cutoff has ALREADY PASSED
//      → starts at now + ROLL_AHEAD_MIN (ordering reopens: cutoff ~90 min away).
//      This covers BOTH dead zones:
//        (a) the show already started (the original bug), and
//        (b) the show has NOT started yet but its cutoff passed — the ~30
//            minute window right before every showtime where visitors still
//            saw "Ordering closed" (the bug that bit the public demo).
//   2. demoAutoRoll = false (the intentionally-BLOCKED demo show, Screen 1):
//      once fully stale (past the 3-hour "current show" window) it re-arms to
//      "starts in 20 min" so the blocked-ordering state stays demonstrable.
//   3. LAST RESORT: if after the roll NO active show on this screen has an
//      open cutoff (e.g. every show is bound to an existing order — audit fix
//      #42 forbids rolling order-holding shows), CREATE a fresh demo showtime
//      so the screen can never dead-end on "Ordering closed".
//
// Business rules are untouched: cutoff math still runs on real wall-clock time.
import { db } from '@/lib/db'
import { cutoffInfo } from './cutoff'

const ROLL_AHEAD_MIN = 120 // reopened show starts 2h from now
const BLOCKED_AHEAD_MIN = 20 // re-armed blocked demo starts 20 min from now
const CURRENT_SHOW_WINDOW_MIN = 180 // must match the "current show" lookback
const FRESH_CUTOFF_MIN = 30 // fresh last-resort show uses the default cutoff

export async function rollStaleShowtimes(screenId?: string): Promise<void> {
  const now = new Date()
  const scope = screenId ? { screenId } : {}

  // 1 · reopenable shows whose ordering cutoff has already passed → roll ahead.
  // Audit fix #42: shows referenced by EXISTING ORDERS are NOT rolled —
  // rewriting startsAt under a placed order corrupted its history (tracking
  // pages started promising a different movie/time than the one ordered).
  // Orderless shows roll as before; order-holders keep their real show and
  // rule 3 below guarantees the screen still gets an orderable show.
  const stale = await db.showtime.findMany({
    where: { demoAutoRoll: true, isActive: true, orders: { none: {} }, ...scope },
    select: { id: true, startsAt: true, orderCutoffMinutes: true },
  })
  const rollable = stale.filter((s) => !cutoffInfo(new Date(s.startsAt), s.orderCutoffMinutes, now).orderingOpen)
  if (rollable.length > 0) {
    await db.showtime.updateMany({
      // re-guard inside the WHERE: an order may have landed between the
      // findMany and this write — never roll a show that just got one
      where: { id: { in: rollable.map((s) => s.id) }, orders: { none: {} } },
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

  // 3 · never dead-end: if the screen still has NO show with an open ordering
  // cutoff, mint a fresh demo showtime (reuses the screen's latest movie so
  // the menu/tracking story stays coherent). Only runs when a screen is given.
  if (screenId) {
    const shows = await db.showtime.findMany({
      where: { screenId, isActive: true },
      orderBy: { startsAt: 'desc' },
      select: { movieTitle: true, language: true, startsAt: true, orderCutoffMinutes: true },
    })
    const anyOpen = shows.some((s) => cutoffInfo(new Date(s.startsAt), s.orderCutoffMinutes, now).orderingOpen)
    if (!anyOpen) {
      const template = shows[0]
      await db.showtime.create({
        data: {
          screenId,
          movieTitle: template?.movieTitle ?? 'Aurora Feature Presentation',
          language: template?.language ?? 'English',
          startsAt: new Date(now.getTime() + ROLL_AHEAD_MIN * 60_000),
          orderCutoffMinutes: FRESH_CUTOFF_MIN,
          demoAutoRoll: true,
        },
      })
    }
  }
}
