// POST /api/internal/hit-audit/flush — the edge middleware pushes aggregated
// (day × UA-class × path) request counters here. Guarded by the shared
// AUDIT_KEY header (compiled into server bundles only, never public).
// Deliberately 404s (not 403) on a bad key so scanners learn nothing.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { AUDIT_KEY, type FlushPayload } from '@/lib/hit-audit'

const clampCount = (n: number) => Math.max(1, Math.min(Math.trunc(n) || 1, 10_000))
const clampIps = (n: number) => Math.max(0, Math.min(Math.trunc(n) || 0, 400))

export async function POST(request: Request) {
  if (request.headers.get('x-audit-key') !== AUDIT_KEY) {
    return new NextResponse(null, { status: 404 })
  }
  const body = (await request.json().catch(() => null)) as FlushPayload | null
  if (
    !body ||
    typeof body.day !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(body.day) ||
    !Array.isArray(body.rows) ||
    body.rows.length === 0 ||
    body.rows.length > 400
  ) {
    return new NextResponse(null, { status: 400 })
  }

  // ips is a first-isolate estimate (summing across isolates would double
  // count) — set on create, left untouched on update. hits increments.
  await Promise.all(
    body.rows.slice(0, 400).map((r) => {
      if (typeof r.uaClass !== 'string' || typeof r.path !== 'string' || r.path.length > 64) {
        return Promise.resolve(undefined)
      }
      return db.hitAudit
        .upsert({
          where: { day_uaClass_path: { day: body.day, uaClass: r.uaClass, path: r.path } },
          create: { day: body.day, uaClass: r.uaClass, path: r.path, hits: clampCount(r.count), ips: clampIps(r.ips) },
          update: { hits: { increment: clampCount(r.count) } },
        })
        .catch(() => undefined)
    }),
  )
  return new NextResponse(null, { status: 204 })
}
