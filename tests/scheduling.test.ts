// Scheduled delivery — slot math invariants (pure functions, no DB)
import { describe, test, expect } from 'bun:test'
import {
  quantizeToSlot,
  upcomingSlots,
  validateScheduledFor,
  dueForPrep,
  slotLabel,
  SLOT_MINUTES,
  MIN_LEAD_MINUTES,
} from '../src/lib/scheduling'

const T = (iso: string) => new Date(iso)

describe('quantizeToSlot', () => {
  test('rounds up to the next 15-minute clock mark', () => {
    expect(quantizeToSlot(T('2026-09-05T10:02:00+00:00')).toISOString()).toBe(T('2026-09-05T10:15:00+00:00').toISOString())
    expect(quantizeToSlot(T('2026-09-05T10:16:00+00:00')).toISOString()).toBe(T('2026-09-05T10:30:00+00:00').toISOString())
  })
  test('an exact slot stays put', () => {
    expect(quantizeToSlot(T('2026-09-05T10:15:00+00:00')).toISOString()).toBe(T('2026-09-05T10:15:00+00:00').toISOString())
  })
})

describe('upcomingSlots', () => {
  test('first slot is at least MIN_LEAD away, slots are 15 min apart', () => {
    const now = T('2026-09-05T10:00:00+00:00')
    const slots = upcomingSlots(now, 16)
    expect(slots).toHaveLength(16)
    expect(slots[0].getTime()).toBeGreaterThanOrEqual(now.getTime() + MIN_LEAD_MINUTES * 60_000)
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].getTime() - slots[i - 1].getTime()).toBe(SLOT_MINUTES * 60_000)
    }
  })
})

describe('validateScheduledFor — server authority', () => {
  const now = T('2026-09-05T10:00:00+00:00')
  test('undefined/empty = ASAP, ok', () => {
    expect(validateScheduledFor(undefined, now)).toEqual({ ok: true, at: null })
    expect(validateScheduledFor('', now)).toEqual({ ok: true, at: null })
  })
  test('too soon is rejected (kitchen needs notice)', () => {
    const res = validateScheduledFor('2026-09-05T10:05:00+00:00', now)
    expect(res.ok).toBe(false)
  })
  test('too far ahead is rejected (9h horizon)', () => {
    const res = validateScheduledFor('2026-09-05T20:00:00+00:00', now)
    expect(res.ok).toBe(false)
  })
  test('garbage is rejected', () => {
    expect(validateScheduledFor('not-a-date', now).ok).toBe(false)
  })
  test('a valid 1-hour-ahead slot passes', () => {
    const res = validateScheduledFor('2026-09-05T11:00:00+00:00', now)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.at?.toISOString()).toBe('2026-09-05T11:00:00.000Z')
  })
})

describe('dueForPrep — kitchen fire logic', () => {
  const now = T('2026-09-05T10:00:00+00:00')
  test('ASAP orders are always due', () => {
    expect(dueForPrep(null, now)).toBe(true)
    expect(dueForPrep(undefined, now)).toBe(true)
  })
  test('slot 30 min out: not due; within 10 min: due; past: due', () => {
    expect(dueForPrep('2026-09-05T10:30:00+00:00', now)).toBe(false)
    expect(dueForPrep('2026-09-05T10:09:00+00:00', now)).toBe(true)
    expect(dueForPrep('2026-09-05T09:55:00+00:00', now)).toBe(true)
  })
})

describe('slotLabel', () => {
  test('renders a short 12-hour label with minutes (timezone-agnostic)', () => {
    expect(slotLabel('2026-09-05T11:00:00+00:00')).toMatch(/^\d{1,2}:\d{2}\s?(am|pm)$/i)
  })
})
