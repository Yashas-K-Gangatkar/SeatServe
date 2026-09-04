// GET /api/internal/hit-audit/read — the owner's "who is hammering the site?"
// answer. Returns the last 3 UTC days of aggregated traffic: totals per UA
// class and the top paths per class. Guarded by the shared AUDIT_KEY header
// (same as flush) so an operator script can read it without a staff login.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'
import { AUDIT_KEY } from '@/lib/hit-audit'

export async function GET(request: Request) {
  if (request.headers.get('x-audit-key') !== AUDIT_KEY) {
    return fail('Not found', 404)
  }
  const since = new Date(Date.now() - 3 * 24 * 3600_000).toISOString().slice(0, 10)
  const rows = await db.hitAudit.findMany({
    where: { day: { gte: since } },
    orderBy: { hits: 'desc' },
    take: 1000,
  })

  // group: day → uaClass → { hits, ips, top paths }
  const days = new Map<string, { total: number; classes: Map<string, { hits: number; ips: number; paths: { path: string; hits: number }[] }> }>()
  for (const r of rows) {
    const day = days.get(r.day) ?? { total: 0, classes: new Map() }
    day.total += r.hits
    const cls = day.classes.get(r.uaClass) ?? { hits: 0, ips: 0, paths: [] }
    cls.hits += r.hits
    cls.ips = Math.max(cls.ips, r.ips)
    cls.paths.push({ path: r.path, hits: r.hits })
    day.classes.set(r.uaClass, cls)
    days.set(r.day, day)
  }

  const data = [...days.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, d]) => ({
      day,
      total: d.total,
      classes: [...d.classes.entries()]
        .sort((a, b) => b[1].hits - a[1].hits)
        .map(([uaClass, c]) => ({
          uaClass,
          hits: c.hits,
          ips: c.ips,
          share: d.total ? Math.round((c.hits / d.total) * 1000) / 10 : 0,
          topPaths: c.paths.sort((a, b) => b.hits - a.hits).slice(0, 8),
        })),
    }))

  return ok({ since, days: data })
}
