// POST /api/admin/settlement/[id]/process — simulate the bank transfer for one
// PENDING settlement batch: assign a UTR, flip the batch to PROCESSED and its
// snapshot rows to SETTLED. MALL_ADMIN only (money movement).

import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { processSettlement } from '@/lib/settlement'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request, ['MALL_ADMIN'])
  if ('error' in auth) return auth.error
  const user = auth.user
  const { id } = await params

  // the batch's store must belong to the caller's mall
  const settlement = await db.settlement.findUnique({ where: { id }, include: { store: true } })
  if (!settlement) return fail('Settlement batch not found', 404)
  if (settlement.store.mallId !== user.mallId) return fail('This batch belongs to another mall', 403)

  const result = await processSettlement(id)
  if (!result.ok) return fail(result.error, result.status)

  return ok({ settlementId: id, utr: result.utr, amountPaise: result.amountPaise })
}
