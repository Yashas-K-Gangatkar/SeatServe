// Edge middleware — hit-audit + scanner-junk kill switch.
//
// PURPOSE (why the site needed this): the Vercel "Requests" graph showed
// ~950k requests/day on notifetch.in with effectively one human user. The
// app's own client polling is bounded (4–10s intervals, hidden-tab guard in
// usePolling), so the flood is external. This middleware (a) counts every
// non-static request into per-day × UA-class × path buckets (flushed to
// HitAudit) so the owner can SEE the flood source, and (b) answers common
// scanner probes (wp-*, .env, phpmyadmin, …) with an instant edge 403 so
// they never reach the app or the database.
//
// SAFETY: everything is wrapped in try/catch and FAILS OPEN — any bug here
// must never take the ordering flow down. Static chunks, images, favicon and
// the hit-audit routes themselves are excluded from the matcher (the
// exclusion of /api/internal/hit-audit also prevents flush→middleware→flush
// recursion).
import { NextResponse, type NextRequest } from 'next/server'
import { classifyUA, bucketPath, isJunkPath, ipHash, AUDIT_KEY, type HitRow } from '@/lib/hit-audit'

// Per-edge-isolate aggregation. Isolates are ephemeral; flushing every ~15s
// (or every 64 requests) keeps worst-case loss per isolate tiny.
const FLUSH_EVERY_REQUESTS = 64
const FLUSH_MIN_MS = 15_000
const MAX_IPS_PER_ROW = 400

const rows = new Map<string, { count: number; ips: Set<string> }>()
let totalSinceFlush = 0
let lastFlushAt = 0

function record(cls: string, path: string, ip: string): void {
  const key = `${cls}|${path}`
  const row = rows.get(key) ?? { count: 0, ips: new Set<string>() }
  row.count++
  if (row.ips.size < MAX_IPS_PER_ROW) row.ips.add(ip)
  rows.set(key, row)
  totalSinceFlush++
}

async function flush(origin: string, force: boolean): Promise<void> {
  const due = force || totalSinceFlush >= FLUSH_EVERY_REQUESTS || Date.now() - lastFlushAt > FLUSH_MIN_MS
  if (!due || rows.size === 0) return
  const payload = {
    day: new Date().toISOString().slice(0, 10),
    rows: [...rows.entries()].map(([key, v]): HitRow => {
      const sep = key.indexOf('|')
      return { uaClass: key.slice(0, sep), path: key.slice(sep + 1), count: v.count, ips: v.ips.size }
    }),
  }
  rows.clear()
  totalSinceFlush = 0
  lastFlushAt = Date.now()
  await fetch(`${origin}/api/internal/hit-audit/flush`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-audit-key': AUDIT_KEY },
    body: JSON.stringify(payload),
  }).catch(() => undefined) // losing a diagnostics batch is fine; the site is not
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  try {
    const origin = new URL(request.url).origin
    const pathname = request.nextUrl.pathname
    const ipRaw = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'x'
    const ip = ipHash(ipRaw)

    if (isJunkPath(pathname)) {
      // Scanner probe — answer at the edge, count it, spend nothing else.
      record('junk-path', bucketPath(pathname), ip)
      await flush(origin, false)
      return new NextResponse(null, { status: 403 })
    }

    record(classifyUA(request.headers.get('user-agent')), bucketPath(pathname), ip)
    const isFlushRequest = totalSinceFlush % FLUSH_EVERY_REQUESTS === 0
    await flush(origin, isFlushRequest)
    return NextResponse.next()
  } catch {
    return NextResponse.next() // fail open, always
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|api/internal/hit-audit).*)'],
}
