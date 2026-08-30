// PATCH /api/products/[id] — mark item unavailable/available (86'd items).
// Phase 2: STORE_MANAGER (own store) or MALL_ADMIN (own mall) only.
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { canAccessStore } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'

const bodySchema = z.object({
  isAvailable: z.boolean().optional(),
  // Audit fix #44 (CRUD increment): mall admin / store manager can reprice items
  pricePaise: z.number().int().min(100).max(10_000_00).optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireStaff(request, ['STORE_MANAGER', 'MALL_ADMIN'])
  if ('error' in auth) return auth.error
  const user = auth.user

  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error

  const product = await db.product.findUnique({ where: { id }, include: { store: true } })
  if (!product) return fail('Product not found', 404)
  if (!canAccessStore(user, { id: product.storeId, mallId: product.store.mallId })) {
    return fail('Your account is not authorized for this store', 403)
  }

  const data: { isAvailable?: boolean; pricePaise?: number } = {}
  if (parsed.data.isAvailable !== undefined) data.isAvailable = parsed.data.isAvailable
  if (parsed.data.pricePaise !== undefined) data.pricePaise = parsed.data.pricePaise
  if (Object.keys(data).length === 0) return fail('Nothing to update', 422)

  await db.product.update({ where: { id }, data })
  await audit({
    actorRole: user.role,
    actorRef: user.email ?? user.id,
    action: parsed.data.isAvailable === false ? 'PRODUCT_SOLD_OUT' : parsed.data.isAvailable === true ? 'PRODUCT_AVAILABLE' : parsed.data.pricePaise !== undefined ? 'PRODUCT_REPRICED' : 'PRODUCT_UPDATED',
    entityType: 'Product',
    entityId: id,
    mallId: product.store.mallId,
    meta: { name: product.name, store: product.store.name, ...(parsed.data.pricePaise !== undefined ? { pricePaise: parsed.data.pricePaise, previousPaise: product.pricePaise } : {}) },
  })
  await emitToRooms({ rooms: [`admin:${product.store.mallId}`], event: 'product:update', data: { productId: id, isAvailable: data.isAvailable ?? product.isAvailable } })

  const fresh = await db.product.findUnique({ where: { id }, select: { id: true, isAvailable: true, pricePaise: true } })
  return ok(fresh)
}
