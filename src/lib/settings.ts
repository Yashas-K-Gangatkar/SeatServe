// SeatServe — configurable business rules (settings table with safe defaults)
import { db } from '@/lib/db'
import type { PlatformFeeConfig } from '@/lib/pricing'
import { DEFAULT_PLATFORM } from '@/lib/pricing'

export interface AppSettings {
  platformFee: PlatformFeeConfig
  orderingCutoffDefaultMinutes: number
  paymentFeePct: number // gateway fee, informational until Phase 3
}

const DEFAULTS: AppSettings = {
  platformFee: DEFAULT_PLATFORM,
  orderingCutoffDefaultMinutes: 30,
  paymentFeePct: 2,
}

export async function getSettings(): Promise<AppSettings> {
  try {
    const rows = await db.appSetting.findMany()
    const map = new Map(rows.map((r) => [r.key, r.value]))
    const out: AppSettings = { ...DEFAULTS }
    const pf = map.get('platform_fee')
    if (pf) out.platformFee = { ...DEFAULT_PLATFORM, ...(JSON.parse(pf) as PlatformFeeConfig) }
    const cutoff = map.get('ordering_cutoff_default_minutes')
    if (cutoff) out.orderingCutoffDefaultMinutes = Number(JSON.parse(cutoff))
    const fee = map.get('payment_fee_pct')
    if (fee) out.paymentFeePct = Number(JSON.parse(fee))
    return out
  } catch {
    return DEFAULTS
  }
}
