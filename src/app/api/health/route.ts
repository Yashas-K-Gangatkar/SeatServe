import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`
    return ok({ service: 'seatserve-api', status: 'healthy', time: new Date().toISOString() })
  } catch {
    return fail('Database unavailable', 503)
  }
}
