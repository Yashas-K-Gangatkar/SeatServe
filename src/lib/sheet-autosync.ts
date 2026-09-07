// sheet-autosync — near-realtime roster pulls without any pinger.
//
// When someone tries to sign in and the server doesn't recognize their login
// (unknown email, or a wrong password that may have just been reset in the
// owner's Excel sheet), we kick a throttled background sheet-sync via
// next/server's after() — the response returns instantly, the sync lands
// right after, and the person's NEXT attempt succeeds on its own.
//
// Safety rails:
//   • dormant unless SHEET_SYNC_URL is configured
//   • throttled to one run per 5 minutes per server instance (memory state)
//   • one run at a time; failures logged, never surfaced to the login response
//   • the sync itself is the same audited, password-safe engine as the cron
//     route — it can only create/update/deactivate rows that exist in the
//     owner's own sheet

import { after } from 'next/server'
import { runSheetSync } from './sheet-sync-run'

const THROTTLE_MS = 5 * 60_000

const state: { lastAt: number; running: boolean } = { lastAt: 0, running: false }

export type Scheduler = (fn: () => Promise<void>) => void

const defaultScheduler: Scheduler = (fn) => {
  after(fn)
}

/** Whether a background sync may start right now (pure, injectable clock). */
export function autoSyncAllowed(now: number = Date.now()): boolean {
  if (!process.env.SHEET_SYNC_URL?.trim()) return false
  if (state.running) return false
  return now - state.lastAt >= THROTTLE_MS
}

/** Record that a sync was issued at `now` (throttle marker; also used by tests). */
export function markAutoSync(now: number = Date.now()): void {
  state.lastAt = now
}

/**
 * Schedule a throttled background roster sync. Returns true when one was
 * actually scheduled (callers must NOT change their response either way).
 * `schedule` and `work` are injectable so tests never touch after()/network.
 */
export function scheduleSheetAutoSync(
  now: number = Date.now(),
  schedule: Scheduler = defaultScheduler,
  work: () => Promise<{ ok: boolean; error?: string }> = () => runSheetSync(false),
): boolean {
  if (!autoSyncAllowed(now)) return false
  markAutoSync(now)
  state.running = true
  schedule(async () => {
    try {
      const out = await work()
      if (!out.ok) console.warn('[sheet-autosync] sync failed:', out.error)
    } catch (err) {
      console.warn('[sheet-autosync] sync crashed:', err instanceof Error ? err.message : err)
    } finally {
      state.running = false
    }
  })
  return true
}

/**
 * INLINE roster freshen for the login gate — same 5-minute throttle and
 * "one at a time" rail as the background sync, but the caller AWAITS it so
 * the roster gate decides with a sheet pull from the last few seconds, not
 * the last few minutes ("the server always checks the Excel sheet when
 * someone logs in"). Bounded by `capMs`: if the sheet is slow, login
 * proceeds against the last-known snapshot instead of hanging.
 *
 * Returns true only when a sync ran AND settled inside the cap. Never throws.
 */
export async function freshenRosterInline(
  now: number = Date.now(),
  work: () => Promise<{ ok: boolean; error?: string }> = () => runSheetSync(false),
  capMs: number = 6000,
): Promise<boolean> {
  if (!autoSyncAllowed(now)) return false
  markAutoSync(now)
  let settled = false
  const p = work()
    .then((out) => {
      if (!out.ok) console.warn('[sheet-autosync] inline sync failed:', out.error)
    })
    .catch((err: unknown) => {
      console.warn('[sheet-autosync] inline sync crashed:', err instanceof Error ? err.message : err)
    })
    .finally(() => {
      settled = true
    })
  await Promise.race([p, new Promise((r) => setTimeout(r, capMs))])
  return settled
}
