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
    // Audit fix #30: the reset wipes ALL users, so the caller's own session
    // dies with them (sessions cascade on user delete). The response now says
    // so honestly instead of pretending the admin stays signed in.
    await seedDemoData(db)
    return ok({ message: 'Demo data reset — two sample orders restored. All sessions were wiped; please sign in again.' })
  } catch (err) {
    console.error('[simulator/reset]', err)
    return fail('Reset failed — see server logs', 500)
  }
}
