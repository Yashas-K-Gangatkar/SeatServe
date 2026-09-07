// sheet-gate — "login is not processed when the name is not in the sheet".
// Pure decision tests + the inline freshen's throttle/cap behavior (work and
// clock injected — no db, no network).
import { describe, expect, test } from 'bun:test'
import {
  emptyRosterState,
  parseRosterState,
  rosterEmailsFromParse,
  rosterGateDecision,
  type RosterState,
} from '../src/lib/sheet-gate'
import { autoSyncAllowed, freshenRosterInline, markAutoSync } from '../src/lib/sheet-autosync'

const MIN = 60_000
const B = 100 * MIN

const armed = (emails: string[], at = '2026-09-08T01:00:00.000Z'): RosterState => ({
  ...emptyRosterState(),
  emails,
  lastSuccessAt: at,
})

const withEnv = (value: string | undefined, fn: () => Promise<void> | void) => {
  const prev = process.env.SHEET_SYNC_URL
  if (value === undefined) delete process.env.SHEET_SYNC_URL
  else process.env.SHEET_SYNC_URL = value
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prev === undefined) delete process.env.SHEET_SYNC_URL
      else process.env.SHEET_SYNC_URL = prev
    })
}

describe('parseRosterState', () => {
  test('missing/blank/corrupt values parse to null', () => {
    expect(parseRosterState(null)).toBeNull()
    expect(parseRosterState(undefined)).toBeNull()
    expect(parseRosterState('')).toBeNull()
    expect(parseRosterState('not json')).toBeNull()
    expect(parseRosterState('{"nope":1}')).toBeNull()
    expect(parseRosterState('{"emails":"not-an-array"}')).toBeNull()
  })

  test('valid JSON round-trips; junk entries filtered', () => {
    const raw = JSON.stringify({ lastSuccessAt: '2026-09-08T01:00:00Z', lastError: null, lastErrorAt: null, emails: ['a@x.in', 42, 'b@y.in'] })
    const st = parseRosterState(raw)
    expect(st).toEqual({ lastSuccessAt: '2026-09-08T01:00:00Z', lastError: null, lastErrorAt: null, emails: ['a@x.in', 'b@y.in'] })
  })
})

describe('rosterGateDecision — armed vs fail-open', () => {
  test('no snapshot (sheet never read successfully) → allow (bootstrap)', () => {
    expect(rosterGateDecision(null, 'ravi@notifetch.in').allowed).toBe(true)
  })

  test('snapshot with zero emails (header-only sheet) → allow', () => {
    expect(rosterGateDecision(armed([]), 'ravi@notifetch.in').allowed).toBe(true)
  })

  test('armed: listed email allowed, case/whitespace-insensitive', () => {
    const st = armed(['Ravi@Notifetch.in ', 'priya@notifetch.in'])
    expect(rosterGateDecision(st, 'ravi@notifetch.in').allowed).toBe(true)
    expect(rosterGateDecision(st, '  RAVI@notifetch.IN').allowed).toBe(true)
    expect(rosterGateDecision(st, 'priya@notifetch.in').allowed).toBe(true)
  })

  test('armed: missing email blocked with a clear reason', () => {
    const d = rosterGateDecision(armed(['priya@notifetch.in']), 'ravi@notifetch.in')
    expect(d.allowed).toBe(false)
    expect(d.reason).toMatch(/not in the roster sheet/)
  })

  test('armed snapshot survives a later sync failure (emails kept, error recorded)', () => {
    const raw = JSON.stringify({ ...armed(['a@x.in']), lastError: 'OneDrive 403', lastErrorAt: '2026-09-08T02:00:00Z' })
    const st = parseRosterState(raw)
    expect(rosterGateDecision(st, 'a@x.in').allowed).toBe(true)
    expect(rosterGateDecision(st, 'intruder@x.in').allowed).toBe(false)
    expect(st?.lastError).toBe('OneDrive 403')
  })
})

describe('rosterEmailsFromParse — skipped rows still count as on the roster', () => {
  test('collects emails from ok rows AND bad rows; lowercases and dedupes', () => {
    const parse = {
      rows: [
        { ok: true as const, record: { email: 'Ravi@Notifetch.in' } },
        { ok: true as const, record: { email: 'priya@notifetch.in' } },
        { ok: false as const, rowNumber: 4, email: 'typo-person@notifetch.in', reason: 'unknown role "CHEFF"' },
        { ok: false as const, rowNumber: 5, email: null, reason: 'missing email' },
        { ok: true as const, record: { email: 'ravi@notifetch.in' } },
      ],
    }
    expect(rosterEmailsFromParse(parse)).toEqual(['ravi@notifetch.in', 'priya@notifetch.in', 'typo-person@notifetch.in'])
  })

  test('empty sheet → no emails (gate would stay open)', () => {
    expect(rosterEmailsFromParse({ rows: [] })).toEqual([])
  })
})

describe('freshenRosterInline', () => {
  test('dormant without SHEET_SYNC_URL — never runs', async () => {
    await withEnv(undefined, async () => {
      markAutoSync(B - 10 * MIN)
      let ran = 0
      const done = await freshenRosterInline(B, () => {
        ran += 1
        return Promise.resolve({ ok: true as const })
      }, 50)
      expect(done).toBe(false)
      expect(ran).toBe(0)
    })
  })

  test('runs inline when throttle allows, then respects the 5-minute throttle', async () => {
    await withEnv('https://example.com/sheet.xlsx', async () => {
      markAutoSync(B - 10 * MIN)
      let ran = 0
      const work = () => {
        ran += 1
        return Promise.resolve({ ok: true as const })
      }
      expect(await freshenRosterInline(B, work, 50)).toBe(true)
      expect(ran).toBe(1)
      expect(autoSyncAllowed(B + MIN)).toBe(false)
      expect(await freshenRosterInline(B + MIN, work, 50)).toBe(false)
      expect(ran).toBe(1)
      expect(await freshenRosterInline(B + 5 * MIN, work, 50)).toBe(true)
      expect(ran).toBe(2)
    })
  })

  test('a work function that throws never escapes the freshen', async () => {
    await withEnv('https://example.com/sheet.xlsx', async () => {
      markAutoSync(B - 10 * MIN)
      const done = await freshenRosterInline(B, () => Promise.reject(new Error('onedrive exploded')), 50)
      expect(done).toBe(true) // settled (with a logged failure), login proceeds
    })
  })

  test('slow sheet: returns after the cap without hanging login', async () => {
    await withEnv('https://example.com/sheet.xlsx', async () => {
      markAutoSync(B - 10 * MIN)
      const t0 = Date.now()
      const done = await freshenRosterInline(
        B,
        () => new Promise((r) => setTimeout(() => r({ ok: true as const }), 400)),
        30,
      )
      expect(done).toBe(false)
      expect(Date.now() - t0).toBeLessThan(300)
    })
  })
})
