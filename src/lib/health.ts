// SeatServe — production self-check (shared by /health page, /api/health, cron ping).
// One call answers the owner question "is prod + DB + demo + realtime up?"
// without logging into Vercel or asking anyone.
import { db } from '@/lib/db'
import { rollStaleShowtimes } from '@/lib/demo-roll'
import { pickCurrentShow } from '@/lib/showtime'

export interface HealthCheck {
  name: string
  status: 'ok' | 'degraded' | 'down'
  detail: string
  latencyMs?: number
}

export interface HealthReport {
  ok: boolean
  service: string
  time: string
  uptimeSec: number
  trigger: 'manual' | 'cron'
  checks: HealthCheck[]
  demo: {
    seat: string | null
    show: string | null
    orderingOpen: boolean
    minutesUntilCutoff: number | null
  } | null
}

const REALTIME_EMIT_URL = process.env.REALTIME_EMIT_URL ?? 'http://127.0.0.1:3004/emit'

export async function runHealthChecks(trigger: 'manual' | 'cron' = 'manual'): Promise<HealthReport> {
  const checks: HealthCheck[] = []

  // 1 · API process — if this code runs, the serverless/standalone app is alive
  checks.push({ name: 'api', status: 'ok', detail: 'seatserve-api responding' })

  // 2 · database — round-trip query + row sanity
  let dbOk = false
  {
    const t0 = Date.now()
    try {
      await db.$queryRaw`SELECT 1`
      const [seats, stores] = await Promise.all([db.seat.count(), db.store.count()])
      dbOk = true
      checks.push({ name: 'database', status: 'ok', detail: `query ok · ${seats} seats · ${stores} stores`, latencyMs: Date.now() - t0 })
    } catch {
      checks.push({ name: 'database', status: 'down', detail: 'unreachable', latencyMs: Date.now() - t0 })
    }
  }

  // 3 · demo pipeline — the exact path a visitor takes: seat → roll → open cutoff
  let demoOk = false
  let demo: HealthReport['demo'] = null
  if (dbOk) {
    try {
      const seat = await db.seat.findFirst({
        where: { screen: { name: 'Screen 3' }, code: 'A-1' },
        select: { qrToken: true, code: true, screenId: true },
      })
      if (seat) {
        await rollStaleShowtimes(seat.screenId)
        const showtimes = await db.showtime.findMany({ where: { screenId: seat.screenId, isActive: true } })
        const picked = pickCurrentShow(showtimes, new Date())
        demoOk = !!picked.show && !!picked.info?.orderingOpen
        demo = {
          seat: seat.code,
          show: picked.show?.movieTitle ?? null,
          orderingOpen: !!picked.info?.orderingOpen,
          minutesUntilCutoff: picked.info?.minutesUntilCutoff ?? null,
        }
        checks.push({
          name: 'demo',
          status: demoOk ? 'ok' : 'degraded',
          detail: demoOk
            ? `Seat ${seat.code} · "${picked.show?.movieTitle}" · ${picked.info!.minutesUntilCutoff}m left to order`
            : 'no orderable showtime after auto-roll',
        })
      } else {
        checks.push({ name: 'demo', status: 'down', detail: 'demo seat (Screen 3 / A-1) missing' })
      }
    } catch {
      checks.push({ name: 'demo', status: 'down', detail: 'demo pipeline error' })
    }
  } else {
    checks.push({ name: 'demo', status: 'down', detail: 'skipped — database down' })
  }

  // 4 · realtime bridge — socket.io hub reachability. Degraded (not down)
  // because dashboards ALWAYS keep a polling fallback (expected on Vercel,
  // where the socket mini-service does not run).
  {
    const t0 = Date.now()
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 1500)
      // empty-room emit is a no-op — safe ping of the internal bus
      const res = await fetch(REALTIME_EMIT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rooms: [], event: 'health:ping', data: null }),
        signal: controller.signal,
      })
      clearTimeout(timer)
      checks.push({ name: 'realtime', status: 'ok', detail: `socket bridge reachable (HTTP ${res.status})`, latencyMs: Date.now() - t0 })
    } catch {
      checks.push({
        name: 'realtime',
        status: 'degraded',
        detail: 'socket bridge unreachable — dashboards fall back to polling (expected on serverless)',
      })
    }
  }

  // realtime degraded does NOT fail the report — polling is a designed fallback
  const ok = dbOk && demoOk
  return { ok, service: 'seatserve-api', time: new Date().toISOString(), uptimeSec: Math.round(process.uptime()), trigger, checks, demo }
}
