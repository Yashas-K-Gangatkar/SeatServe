// SeatServe — configurable business rules (settings table with safe defaults).
// Platform fee is FIXED at 5% of the customer's total (owner decision) — not
// settings-driven. The walk buffer (timing, not money) stays configurable.
import { db } from '@/lib/db'
import { PLATFORM_FEE_PCT, DEFAULT_WALK_BUFFER_MIN } from '@/lib/pricing'

export interface AppSettings {
  platformFeePct: number // fixed 5% — informational for clients
  walkBufferMin: number
  orderingCutoffDefaultMinutes: number
  paymentFeePct: number // gateway fee, informational
}

const DEFAULTS: AppSettings = {
  platformFeePct: PLATFORM_FEE_PCT,
  walkBufferMin: DEFAULT_WALK_BUFFER_MIN,
  orderingCutoffDefaultMinutes: 30,
  paymentFeePct: 2,
}

export async function getSettings(): Promise<AppSettings> {
  try {
    const rows = await db.appSetting.findMany()
    const map = new Map(rows.map((r) => [r.key, r.value]))
    const out: AppSettings = { ...DEFAULTS }
    const walk = map.get('walk_buffer_min')
    if (walk) out.walkBufferMin = Number(JSON.parse(walk))
    const cutoff = map.get('ordering_cutoff_default_minutes')
    if (cutoff) out.orderingCutoffDefaultMinutes = Number(JSON.parse(cutoff))
    const fee = map.get('payment_fee_pct')
    if (fee) out.paymentFeePct = Number(JSON.parse(fee))
    return out
  } catch {
    return DEFAULTS
  }
}
