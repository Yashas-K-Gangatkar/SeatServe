// Scheduled delivery — "order now, eat at the break".
// A customer who is free at 10:00 but breaks at 11:00 orders early and picks a
// future slot; the kitchen fires 10 minutes before the slot and the runner
// drops the food right as the break starts. Slots are quantized to 15-minute
// clock marks (:00 :15 :30 :45) so a whole classroom's orders batch into one
// runner run — and in cinemas the same mechanic becomes interval delivery.

export const SLOT_MINUTES = 15
export const MIN_LEAD_MINUTES = 15 // kitchen needs at least this much notice
export const MAX_HORIZON_HOURS = 9 // same-day planning only
export const PREP_WINDOW_MINUTES = 10 // how early before the slot the kitchen should start

/** Round a timestamp UP to the next 15-minute clock mark (:00 :15 :30 :45). */
export function quantizeToSlot(d: Date): Date {
  const ms = SLOT_MINUTES * 60_000
  return new Date(Math.ceil(d.getTime() / ms) * ms)
}

/** The selectable slots a customer sees: quantized, 15 min apart, N of them. */
export function upcomingSlots(now: Date, count = 16): Date[] {
  const first = quantizeToSlot(new Date(now.getTime() + MIN_LEAD_MINUTES * 60_000))
  const slots: Date[] = []
  for (let i = 0; i < count; i++) slots.push(new Date(first.getTime() + i * SLOT_MINUTES * 60_000))
  return slots
}

export type ScheduleValidation =
  | { ok: true; at: Date | null } // null = deliver ASAP
  | { ok: false; error: string }

/** Server-side authority for a client-supplied scheduledFor (ISO string). */
export function validateScheduledFor(raw: string | undefined | null, now: Date): ScheduleValidation {
  if (raw === undefined || raw === null || raw === '') return { ok: true, at: null }
  const at = new Date(raw)
  if (Number.isNaN(at.getTime())) return { ok: false, error: 'Invalid delivery time.' }
  const min = now.getTime() + MIN_LEAD_MINUTES * 60_000
  const max = now.getTime() + MAX_HORIZON_HOURS * 3_600_000
  const t = at.getTime()
  if (t < min - 30_000)
    return { ok: false, error: 'Pick a slot at least 15 minutes from now — the kitchen needs notice.' }
  if (t > max + 30_000) return { ok: false, error: 'Delivery can be scheduled at most 9 hours ahead.' }
  return { ok: true, at }
}

/**
 * Should this ticket be in the cook-now pile?
 * ASAP orders (null slot) are always due; scheduled orders become due when the
 * slot is within PREP_WINDOW_MINUTES (or already passed).
 */
export function dueForPrep(scheduledFor: Date | string | null | undefined, now: Date): boolean {
  if (!scheduledFor) return true
  return new Date(scheduledFor).getTime() - now.getTime() <= PREP_WINDOW_MINUTES * 60_000
}

/** "11:00 am" style label shared by every surface. */
export function slotLabel(d: Date | string): string {
  return new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
}
