// sheet-autosync — throttle/state tests (scheduler + work injected, no after(), no network).
import { describe, expect, test } from 'bun:test'
import { autoSyncAllowed, markAutoSync, scheduleSheetAutoSync } from '../src/lib/sheet-autosync'

const MIN = 60_000
const B = 100 * MIN // realistic base instant, far from the epoch-zero initial state
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

// scheduler that runs the work inline (work is a fake that resolves instantly)
function inlineRunner(counter: { n: number }) {
  return (fn: () => Promise<void>) => {
    counter.n += 1
    return fn()
  }
}
const fakeWork = () => Promise.resolve({ ok: true as const })

describe('autoSyncAllowed', () => {
  test('dormant without SHEET_SYNC_URL', async () => {
    await withEnv(undefined, () => {
      markAutoSync(0)
      expect(autoSyncAllowed(10 * MIN)).toBe(false)
    })
  })

  test('throttles to one run per 5 minutes', async () => {
    await withEnv('https://example.com/sheet.xlsx', () => {
      markAutoSync(B)
      expect(autoSyncAllowed(B + 4 * MIN)).toBe(false)
      expect(autoSyncAllowed(B + 5 * MIN)).toBe(true)
    })
  })
})

describe('scheduleSheetAutoSync', () => {
  test('schedules when fresh, throttles inside 5 min, allows again after completion + 5 min', async () => {
    await withEnv('https://example.com/sheet.xlsx', async () => {
      markAutoSync(B - 10 * MIN)
      const counter = { n: 0 }
      const run = inlineRunner(counter)

      expect(scheduleSheetAutoSync(B, run, fakeWork)).toBe(true)
      expect(counter.n).toBe(1)
      await Promise.resolve() // let the inline fake work finish (clears running)

      expect(scheduleSheetAutoSync(B + MIN, run, fakeWork)).toBe(false)
      expect(scheduleSheetAutoSync(B + 4 * MIN, run, fakeWork)).toBe(false)
      expect(counter.n).toBe(1)

      expect(scheduleSheetAutoSync(B + 5 * MIN, run, fakeWork)).toBe(true)
      expect(counter.n).toBe(2)
    })
  })

  test('never schedules when dormant', async () => {
    await withEnv(undefined, async () => {
      markAutoSync(B - 10 * MIN)
      const counter = { n: 0 }
      expect(scheduleSheetAutoSync(B, inlineRunner(counter), fakeWork)).toBe(false)
      expect(counter.n).toBe(0)
    })
  })

  test('a failing sync still clears the running flag (next attempt possible)', async () => {
    await withEnv('https://example.com/sheet.xlsx', async () => {
      markAutoSync(B - 10 * MIN)
      const counter = { n: 0 }
      const run = (fn: () => Promise<void>) => {
        counter.n += 1
        return fn()
      }
      const failing = () => Promise.resolve({ ok: false as const, error: 'boom' })
      expect(scheduleSheetAutoSync(B, run, failing)).toBe(true)
      await Promise.resolve()
      expect(autoSyncAllowed(B + 5 * MIN)).toBe(true)
      expect(counter.n).toBe(1)
    })
  })
})
