// POST /api/simulator/reset — wipe + reseed the demo dataset.
// Demo convenience ONLY. Phase 2 removes this route behind role auth.
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'
import { seedDemoData } from '../../../../../prisma/seed'

export async function POST() {
  try {
    await seedDemoData(db)
    return ok({ message: 'Demo data reset. Two sample orders restored, all sessions wiped.' })
  } catch (err) {
    console.error('[simulator/reset]', err)
    return fail('Reset failed — see server logs', 500)
  }
}
