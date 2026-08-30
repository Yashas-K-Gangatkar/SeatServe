// POST /api/simulator/reset — wipe + reseed the demo dataset (MALL_ADMIN only).
// Demo convenience; also wipes all staff sessions (sessions cascade on user delete).
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { seedDemoData } from '../../../../../prisma/seed'

export async function POST(request: Request) {
  const auth = await requireStaff(request, ['MALL_ADMIN'])
  if ('error' in auth) return auth.error
  try {
    await seedDemoData(db)
    return ok({ message: 'Demo data reset. Two sample orders restored, all sessions wiped.' })
  } catch (err) {
    console.error('[simulator/reset]', err)
    return fail('Reset failed — see server logs', 500)
  }
}
