// GET /api/auth/me — current staff session profile (or 401).
import { ok, fail } from '@/lib/api-helpers'
import { sessionUser } from '@/lib/auth-server'

export async function GET(request: Request) {
  const user = await sessionUser(request)
  if (!user) return fail('Not signed in', 401)
  return ok(user)
}
