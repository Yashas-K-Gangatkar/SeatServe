import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'
import { cronSecretMatches } from '@/lib/cron-auth'

export async function GET(request: Request) {
  const startedAt = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    const latencyMs = Date.now() - startedAt

    // Daily maintenance branch (Vercel cron, ?cron=1). Sessions used to be
    // cleaned up only lazily — when an expired cookie happened to be presented
    // or the user logged out — so the table grew forever. The nightly cron now
    // purges everything past its expiry. Auth: requires CRON_SECRET; if the
    // secret is unset the branch is disabled entirely (fail-closed, same rule
    // as /api/admin/settlement/auto-daily).
    let maintenance: { purgedSessions: number } | undefined
    const url = new URL(request.url)
    if (url.searchParams.get('cron') === '1') {
      if (!cronSecretMatches(process.env.CRON_SECRET, request.headers.get('authorization'))) {
        return fail('Unauthorized', 401)
      }
      const purged = await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })
      maintenance = { purgedSessions: purged.count }
    }

    return ok({
      service: 'seatserve-api',
      status: 'healthy',
      time: new Date().toISOString(),
      latencyMs,
      ...(maintenance ? { maintenance } : {}),
    })
  } catch {
    return fail('Database unavailable', 503)
  }
}
