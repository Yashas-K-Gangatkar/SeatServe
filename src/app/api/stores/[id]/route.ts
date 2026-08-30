// PATCH /api/stores/[id] — store controls (open/close). Phase 2: role-gated.
// STORE_MANAGER: own store only. MALL_ADMIN: any store in their mall.
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { canAccessStore } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'

const bodySchema = z.object({
  isOpen: z.boolean().optional(),
  // Audit fix #44 (CRUD increment): commission % and delivery fee are editable
  commissionPct: z.number().min(0).max(50).optional(),
  deliveryFeePaise: z.number().int().min(0).max(100_000).optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireStaff(request, ['STORE_MANAGER', 'MALL_ADMIN'])
  if ('error' in auth) return auth.error
  const user = auth.user

  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error

  const store = await db.store.findUnique({ where: { id } })
  if (!store) return fail('Store not found', 404)
  if (!canAccessStore(user, { id: store.id, mallId: store.mallId })) {
    return fail('Your account is not authorized for this store', 403)
  }

  const data: { isOpen?: boolean; commissionPct?: number; deliveryFeePaise?: number } = {}
  if (parsed.data.isOpen !== undefined) data.isOpen = parsed.data.isOpen
  if (parsed.data.commissionPct !== undefined) data.commissionPct = parsed.data.commissionPct
  if (parsed.data.deliveryFeePaise !== undefined) data.deliveryFeePaise = parsed.data.deliveryFeePaise

  if (data.isOpen !== undefined) {
    await db.store.update({ where: { id }, data: { isOpen: data.isOpen } })
    await audit({
      actorRole: user.role,
      actorRef: user.email ?? user.id,
      action: data.isOpen ? 'STORE_OPENED' : 'STORE_CLOSED',
      entityType: 'Store',
      entityId: id,
      mallId: store.mallId,
      meta: { name: store.name },
    })
    await emitToRooms({ rooms: [`admin:${store.mallId}`], event: 'store:update', data: { storeId: id, isOpen: data.isOpen } })
  }
  if (data.commissionPct !== undefined || data.deliveryFeePaise !== undefined) {
    await db.store.update({ where: { id }, data })
    await audit({
      actorRole: user.role,
      actorRef: user.email ?? user.id,
      action: 'STORE_UPDATED',
      entityType: 'Store',
      entityId: id,
      mallId: store.mallId,
      meta: {
        name: store.name,
        ...(data.commissionPct !== undefined ? { commissionPct: data.commissionPct, previousPct: store.commissionPct } : {}),
        ...(data.deliveryFeePaise !== undefined ? { deliveryFeePaise: data.deliveryFeePaise, previousPaise: store.deliveryFeePaise } : {}),
      },
    })
  }

  const updated = await db.store.findUnique({ where: { id } })
  return ok({ id, isOpen: updated?.isOpen, commissionPct: updated?.commissionPct, deliveryFeePaise: updated?.deliveryFeePaise })
}
