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

  // 1 · reopenable shows that have already started → SUPERSEDE them.
  // Audit fix #42 (v1) skipped shows referenced by existing orders because
  // rewriting startsAt corrupted their history — but that let a handful of
  // test orders permanently freeze every demo screen ("Ordering closed"
  // forever). v2: the stale showtime is RETIRED (isActive=false) and a fresh
  // future showtime takes over on the same screen. Old orders keep pointing
  // at the retired show — history intact, nothing rewritten — while new
  // orders land on the fresh show.
  // v3: also roll shows whose ORDERING WINDOW has died even though the show
  // hasn't started (cutoff passed, startsAt still future). Without this there
  // is a 30-minute dead zone per cycle where the seat page reads
  // "Ordering closed" although the guardian's own startsAt<now trigger will
  // not fire yet — found during landing QA, breaks the Try Demo path.
  const stale = await db.showtime.findMany({
    where: {
      demoAutoRoll: true,
      isActive: true,
      OR: [
        { startsAt: { lt: now } }, // show already started
        {
          // ordering closed (cutoff passed) while the show is still future —
          // roll anything that starts within its own cutoff window from now
          startsAt: { lt: new Date(now.getTime() + 30 * 60_000) },
        },
      ],
      ...scope,
    },
    select: { id: true, screenId: true, movieTitle: true, language: true, orderCutoffMinutes: true },
  })
  for (const st of stale) {
    await db.showtime.create({
      data: {
        screenId: st.screenId,
        movieTitle: st.movieTitle,
        language: st.language,
        startsAt: new Date(now.getTime() + ROLL_AHEAD_MIN * 60_000),
        orderCutoffMinutes: st.orderCutoffMinutes,
        isActive: true,
        demoAutoRoll: true,
      },
    })
    await db.showtime.update({ where: { id: st.id }, data: { isActive: false } })
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
