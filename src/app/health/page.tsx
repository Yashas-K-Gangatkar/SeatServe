// /health — human-readable system status dashboard (server-rendered, no JS).
// Same checks as /api/health — open after a deploy to confirm prod + DB +
// demo + realtime in one glance. Cron pings the JSON endpoint daily.
import { runHealthChecks, type HealthCheck } from '@/lib/health'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'SeatServe — System status',
  description: 'Live self-check: web, database, demo pipeline and realtime bridge.',
}

const DOT: Record<HealthCheck['status'], string> = {
  ok: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  down: 'bg-red-500',
}

const LABEL: Record<HealthCheck['status'], string> = {
  ok: 'OK',
  degraded: 'DEGRADED',
  down: 'DOWN',
}

export default async function HealthPage() {
  const report = await runHealthChecks('manual')
  const ist = new Date(report.time).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: 'numeric',
    month: 'short',
  })

  return (
    <div className="site-root flex min-h-dvh items-center justify-center bg-[#FAF8F5] px-4 py-10 text-[#1A1A1A]">
      <main className="w-full max-w-lg">
        <div className="rounded-3xl border border-[#EFEAE0] bg-white p-7 shadow-[0_10px_36px_rgba(0,0,0,0.08)]">
          {/* overall badge */}
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-[17px] font-extrabold tracking-tight">
              <span aria-hidden>🍿</span> SeatServe
            </p>
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-extrabold uppercase tracking-wider ${
                report.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${report.ok ? 'bg-emerald-500' : 'bg-red-500'}`} aria-hidden />
              {report.ok ? 'All systems operational' : 'Degraded — needs attention'}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-[#8B8B8B]">
            System status · {ist} IST · uptime {Math.floor(report.uptimeSec / 60)}m
          </p>

          {/* per-check rows */}
          <ul className="mt-5 space-y-2.5">
            {report.checks.map((c) => (
              <li key={c.name} className="flex items-start gap-3 rounded-2xl bg-[#FAF8F5] px-4 py-3">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[c.status]}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="text-[14px] font-bold capitalize">{c.name}</span>
                    <span
                      className={`text-[10px] font-extrabold uppercase tracking-wider ${
                        c.status === 'ok' ? 'text-emerald-600' : c.status === 'degraded' ? 'text-amber-600' : 'text-red-600'
                      }`}
                    >
                      {LABEL[c.status]}
                    </span>
                  </p>
                  <p className="mt-0.5 break-words text-[13px] leading-snug text-[#6F6F6F]">{c.detail}</p>
                </div>
                {typeof c.latencyMs === 'number' && (
                  <span className="shrink-0 text-[11px] font-semibold tabular text-[#8B8B8B]">{c.latencyMs}ms</span>
                )}
              </li>
            ))}
          </ul>

          {/* demo snapshot */}
          {report.demo && (
            <div className="mt-5 rounded-2xl border border-[#D4AF37]/30 bg-[#D4AF37]/[0.07] px-4 py-3">
              <p className="text-[12px] font-extrabold uppercase tracking-wider text-[#8a6d1f]">Live demo snapshot</p>
              <p className="mt-1 text-[13px] leading-snug text-[#3F3F3F]">
                Seat {report.demo.seat} · “{report.demo.show}” ·{' '}
                {report.demo.orderingOpen
                  ? <>ordering open — <b>{report.demo.minutesUntilCutoff} min</b> left</>
                  : 'ordering closed (auto-roll will reopen it)'}
              </p>
            </div>
          )}

          <p className="mt-5 text-[12px] text-[#8B8B8B]">
            Machine-readable JSON: <a href="/api/health" className="font-semibold text-[#8a6d1f] underline underline-offset-2">/api/health</a>
            {' '}· pinged daily by a Vercel cron job
          </p>
        </div>
      </main>
    </div>
  )
}
