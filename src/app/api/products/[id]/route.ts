// PATCH /api/products/[id] — mark item unavailable/available (86'd items).
// Phase 2: STORE_MANAGER (own store); CAMPUS_ADMIN / BLOCK_MANAGER (own campus).
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { canAccessStore } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'

const bodySchema = z.object({
  isAvailable: z.boolean().optional(),
  // Audit fix #44 (CRUD increment): campus admin / store manager can reprice items
  pricePaise: z.number().int().min(100).max(10_000_00).optional(),
  // photo can be attached/updated any time (compulsory at creation)
  imageUrl: z.string().trim().min(4).max(400).optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireStaff(request, ['STORE_MANAGER', 'CAMPUS_ADMIN', 'BLOCK_MANAGER'])
  if ('error' in auth) return auth.error
  const user = auth.user

  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error

  const product = await db.product.findUnique({ where: { id }, include: { store: true } })
  if (!product) return fail('Product not found', 404)
  if (!canAccessStore(user, { id: product.storeId, campusId: product.store.campusId })) {
    return fail('Your account is not authorized for this store', 403)
  }

  const data: { isAvailable?: boolean; pricePaise?: number; imageUrl?: string } = {}
  if (parsed.data.isAvailable !== undefined) data.isAvailable = parsed.data.isAvailable
  if (parsed.data.pricePaise !== undefined) data.pricePaise = parsed.data.pricePaise
  if (parsed.data.imageUrl !== undefined) data.imageUrl = parsed.data.imageUrl
  if (Object.keys(data).length === 0) return fail('Nothing to update', 422)

  await db.product.update({ where: { id }, data })
  await audit({
    actorRole: user.role,
    actorRef: user.email ?? user.id,
    action: parsed.data.isAvailable === false ? 'PRODUCT_SOLD_OUT' : parsed.data.isAvailable === true ? 'PRODUCT_AVAILABLE' : parsed.data.pricePaise !== undefined ? 'PRODUCT_REPRICED' : 'PRODUCT_UPDATED',
    entityType: 'Product',
    entityId: id,
    campusId: product.store.campusId,
    meta: { name: product.name, store: product.store.name, ...(parsed.data.pricePaise !== undefined ? { pricePaise: parsed.data.pricePaise, previousPaise: product.pricePaise } : {}) },
  })
  await emitToRooms({ rooms: [`admin:${product.store.campusId}`], event: 'product:update', data: { productId: id, isAvailable: data.isAvailable ?? product.isAvailable } })

  const fresh = await db.product.findUnique({ where: { id }, select: { id: true, isAvailable: true, pricePaise: true, imageUrl: true } })
  return ok(fresh)
}

// DELETE /api/products/[id] — remove an item from the menu entirely (the
// "I added this by mistake" case; "finished for today" should use the 86
// toggle instead). Past orders are untouched: their line items keep the
// name/price snapshots (only the product link is nulled) and any open cart
// holding the item is cleaned so nobody checks out with a ghost line.
// STORE_MANAGER (own store); CAMPUS_ADMIN / BLOCK_MANAGER (own campus).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireStaff(request, ['STORE_MANAGER', 'CAMPUS_ADMIN', 'BLOCK_MANAGER'])
  if ('error' in auth) return auth.error
  const user = auth.user

  const product = await db.product.findUnique({ where: { id }, include: { store: true } })
  if (!product) return fail('Product not found', 404)
  if (!canAccessStore(user, { id: product.storeId, campusId: product.store.campusId })) {
    return fail('Your account is not authorized for this store', 403)
  }

  const pastOrders = await db.orderItem.count({ where: { productId: id } })

  await db.$transaction([
    // order history stays readable via its snapshots — just unlink the product
    db.orderItem.updateMany({ where: { productId: id }, data: { productId: null } }),
    // open carts must not hold a line the kitchen can never cook
    db.cartItem.deleteMany({ where: { productId: id } }),
    db.product.delete({ where: { id } }),
  ])

  await audit({
    actorRole: user.role,
    actorRef: user.email ?? user.id,
    action: 'PRODUCT_DELETED',
    entityType: 'Product',
    entityId: id,
    campusId: product.store.campusId,
    meta: { name: product.name, store: product.store.name, pastOrders },
  })
  await emitToRooms({ rooms: [`admin:${product.store.campusId}`], event: 'product:update', data: { productId: id, isAvailable: false, deleted: true } })

  return ok({ deleted: id, name: product.name, pastOrders })
}
