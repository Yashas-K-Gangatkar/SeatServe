// POST /api/admin/kyc/[storeId] — Phase 4: mall admin VERIFIES or REJECTS a
// store's KYC. VERIFIED stores are payout-eligible (the settlement engine only
// pays verified merchants); REJECTED sends the store back to fix their details.
// Every decision is audited and pushed to the store's realtime room.

import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'

const bodySchema = z.object({
  action: z.enum(['VERIFY', 'REJECT']),
})

export async function POST(request: Request, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params
  const auth = await requireStaff(request, ['MALL_ADMIN'])
  if ('error' in auth) return auth.error
  const user = auth.user

  const store = await db.store.findUnique({ where: { id: storeId } })
  if (!store) return fail('Store not found', 404)
  if (store.mallId !== (user.mallId ?? '__none__')) {
    return fail('This store belongs to another mall', 403)
  }
  if (!store.kycDetail) return fail('The store has not submitted KYC yet', 409)

  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error

  const status = parsed.data.action === 'VERIFY' ? 'VERIFIED' : 'REJECTED'
  const updated = await db.store.update({ where: { id: storeId }, data: { kycStatus: status } })

  await audit({
    actorRole: user.role,
    actorRef: user.email ?? user.id,
    action: parsed.data.action === 'VERIFY' ? 'KYC_VERIFIED' : 'KYC_REJECTED',
    entityType: 'Store',
    entityId: storeId,
    mallId: store.mallId,
    meta: { name: store.name, previousStatus: store.kycStatus },
  })

  await emitToRooms({
    rooms: [`admin:${store.mallId}`, `store:${storeId}`],
    event: 'store:update',
    data: { storeId, kycStatus: status },
  })

  return ok({ storeId, kycStatus: updated.kycStatus, name: updated.name })
}
