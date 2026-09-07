// sheet-gate — the roster gate: "if your name is not in the owner's Excel
// sheet, your login is not processed" (owner requirement, Sep 2026).
//
// Every successful real runSheetSync() stores the sheet's email list as the
// last-known roster snapshot in AppSetting (key: sheet_roster_state). The
// staff login route freshens that snapshot (throttled inline pull) and then
// consults it: when a snapshot exists with at least one email, any email NOT
// in the sheet is rejected before credentials are even looked at.
//
// Fail-open by design in exactly two cases:
//   • the snapshot was never written (no successful sheet pull yet — e.g. the
//     owner's workbook still has no header row) — otherwise the very first
//     broken sheet would lock out every staff account;
//   • the snapshot holds zero emails (header-only sheet — ambiguous state,
//     treated as "roster not armed yet").
// Everything else is strict: roster armed + email missing → login blocked,
// even if the account exists in the database with a valid password.
//
// This module is PURE (no I/O) so the gate rules are unit-testable; callers
// own the AppSetting read/write.

export const ROSTER_STATE_KEY = 'sheet_roster_state'

export type RosterState = {
  /** ISO time of the last successful (non-dry) sheet apply — null if never. */
  lastSuccessAt: string | null
  /** Last sync failure reason (fetch or parse) — null when the last attempt succeeded. */
  lastError: string | null
  lastErrorAt: string | null
  /** Every email present in the last successfully-read sheet (lowercase, deduped). */
  emails: string[]
}

export function emptyRosterState(): RosterState {
  return { lastSuccessAt: null, lastError: null, lastErrorAt: null, emails: [] }
}

/** Parse the stored AppSetting value → RosterState, or null when absent/corrupt. */
export function parseRosterState(raw: string | null | undefined): RosterState | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<RosterState> | null
    if (!v || typeof v !== 'object' || !Array.isArray(v.emails)) return null
    return {
      lastSuccessAt: typeof v.lastSuccessAt === 'string' ? v.lastSuccessAt : null,
      lastError: typeof v.lastError === 'string' ? v.lastError : null,
      lastErrorAt: typeof v.lastErrorAt === 'string' ? v.lastErrorAt : null,
      emails: v.emails.filter((e): e is string => typeof e === 'string'),
    }
  } catch {
    return null
  }
}

/**
 * The gate decision for one login attempt.
 * `null` state (never synced) → allow with a note; armed snapshot + missing
 * email → block. Matching is case-insensitive and whitespace-tolerant — the
 * sheet is typed by a human.
 */
export function rosterGateDecision(
  state: RosterState | null,
  email: string,
): { allowed: boolean; reason: string | null } {
  const want = email.trim().toLowerCase()
  if (!state || state.emails.length === 0) return { allowed: true, reason: null } // gate not armed yet
  const listed = state.emails.some((e) => e.trim().toLowerCase() === want)
  return listed
    ? { allowed: true, reason: null }
    : { allowed: false, reason: 'email not in the roster sheet' }
}

/**
 * Every email found in a parsed sheet — INCLUDING rows that were skipped for
 * a bad role/store/password. The gate answers "is this person on the
 * roster?", which is a property of the sheet, not of row perfection: a typo
 * in someone's role must never silently lock them out of the gate.
 */
export function rosterEmailsFromParse(parse: {
  rows: Array<{ ok: true; record: { email: string } } | { ok: false; email: string | null }>
}): string[] {
  const out = new Set<string>()
  for (const row of parse.rows) {
    const email = (row.ok ? row.record.email : row.email ?? '').trim().toLowerCase()
    if (email) out.add(email)
  }
  return [...out]
}
