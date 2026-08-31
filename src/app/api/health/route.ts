// GET /api/health — machine-readable self-check (web + DB + demo + realtime).
// A daily Vercel cron pings this endpoint (?cron=1) so downtime is caught
// without anyone asking; humans can open /health for the visual dashboard.
import { ok, fail } from '@/lib/api-helpers'
import { runHealthChecks } from '@/lib/health'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const trigger = url.searchParams.get('cron') ? 'cron' : 'manual'
  const report = await runHealthChecks(trigger)
  if (report.ok) return ok(report)
  return fail('Health check failed', 503, { report })
}
