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
  isAvailable: z.boolean(),
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

  await db.product.update({ where: { id }, data: { isAvailable: parsed.data.isAvailable } })
  await audit({
    actorRole: user.role,
    actorRef: user.email ?? user.id,
    action: parsed.data.isAvailable ? 'PRODUCT_AVAILABLE' : 'PRODUCT_SOLD_OUT',
    entityType: 'Product',
    entityId: id,
    meta: { name: product.name, store: product.store.name },
  })
  await emitToRooms({ rooms: ['admin'], event: 'product:update', data: { productId: id, isAvailable: parsed.data.isAvailable } })

  return ok({ id, isAvailable: parsed.data.isAvailable })
}
