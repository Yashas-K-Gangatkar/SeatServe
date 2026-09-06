// GET  /api/admin/settlement — per-store settlement summaries (ledger-driven)
// POST /api/admin/settlement — create PENDING settlement batches for stores
//
// Scoping: CAMPUS_ADMIN sees/creates for their whole campus; STORE_MANAGER is
// read-only and pinned to their own store. BLOCK_MANAGER/KITCHEN_STAFF/RUNNER
// have no settlement access (money is campus-level, not block/kitchen-level).

import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { storeSettlementSummary, runSettlementBatch } from '@/lib/settlement'

export async function GET(request: Request) {
  const auth = await requireStaff(request, ['CAMPUS_ADMIN', 'STORE_MANAGER'])
  if ('error' in auth) return auth.error
  const user = auth.user

  const stores =
    user.role === 'CAMPUS_ADMIN'
      ? await db.store.findMany({ where: { campusId: user.campusId ?? '__none__' }, orderBy: { name: 'asc' } })
      : await db.store.findMany({ where: { id: user.storeId ?? '__none__' } })

  const summaries = (
    await Promise.all(stores.map((s) => storeSettlementSummary(s.id)))
  ).filter((s): s is NonNullable<typeof s> => s !== null)

  // recent batches for this campus (bank-transfer log)
  const storeIds = stores.map((s) => s.id)
  const batches = await db.settlement.findMany({
    where: { storeId: { in: storeIds } },
    include: { store: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return ok({
    scope: user.role === 'CAMPUS_ADMIN' ? 'Campus-wide' : 'Your store only',
    stores: summaries,
    batches: batches.map((b) => ({
      id: b.id,
      storeName: b.store.name,
      amountPaise: b.amountPaise,
      status: b.status,
      utr: b.utr,
      detail: b.detail ? JSON.parse(b.detail) : null,
      createdAt: b.createdAt,
      processedAt: b.processedAt,
    })),
  })
}

const bodySchema = z.object({
  storeIds: z.array(z.string().min(1)).max(50).optional(),
})

export async function POST(request: Request) {
  const auth = await requireStaff(request, ['CAMPUS_ADMIN'])
  if ('error' in auth) return auth.error
  const user = auth.user

  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error

  // guard: requested stores must live in the caller's campus
  if (parsed.data.storeIds?.length) {
    const foreign = await db.store.count({ where: { id: { in: parsed.data.storeIds }, campusId: { not: user.campusId ?? '__none__' } } })
    if (foreign > 0) return fail('One or more stores are outside your campus', 403)
  }

  const result = await runSettlementBatch(user.campusId ?? '__none__', parsed.data.storeIds)
  if (result.batches.length === 0) {
    return fail('Nothing to settle — every store has an empty pending ledger', 409)
  }
  return ok(result, 201)
}
