// PATCH /api/stores/[id] — store controls (open/close, rename, commission).
// STORE_MANAGER: own store only. MALL_ADMIN: any store in their mall.
// Money model: NO delivery fee (stores are next door); commission stays editable.
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { canAccessStore } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'

const bodySchema = z.object({
  isOpen: z.boolean().optional(),
  // Audit fix #44 (CRUD increment): commission % is editable
  commissionPct: z.number().min(0).max(50).optional(),
  // Rename (e.g. "milk products" → the shop's real signboard name)
  name: z.string().trim().min(2, 'Store name is too short').max(60, 'Store name is too long').optional(),
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

  const data: { isOpen?: boolean; commissionPct?: number; name?: string } = {}
  if (parsed.data.isOpen !== undefined) data.isOpen = parsed.data.isOpen
  if (parsed.data.commissionPct !== undefined) data.commissionPct = parsed.data.commissionPct
  if (parsed.data.name !== undefined) data.name = parsed.data.name

  if (data.name !== undefined) {
    const previousName = store.name
    await db.store.update({ where: { id }, data: { name: data.name } })
    await audit({
      actorRole: user.role,
      actorRef: user.email ?? user.id,
      action: 'STORE_RENAMED',
      entityType: 'Store',
      entityId: id,
      mallId: store.mallId,
      meta: { previousName, newName: data.name },
    })
    await emitToRooms({
      rooms: [`admin:${store.mallId}`, `store:${id}`],
      event: 'store:update',
      data: { storeId: id, name: data.name },
    })
  }
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
  if (data.commissionPct !== undefined) {
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
      },
    })
  }

  const updated = await db.store.findUnique({ where: { id } })
  return ok({ id, name: updated?.name, isOpen: updated?.isOpen, commissionPct: updated?.commissionPct })
}
