// PATCH /api/products/[id] — mark item unavailable/available (86'd items)
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'

const bodySchema = z.object({
  isAvailable: z.boolean(),
  actorRole: z.string().default('STORE_MANAGER'),
  actorRef: z.string().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error

  const product = await db.product.findUnique({ where: { id }, include: { store: true } })
  if (!product) return fail('Product not found', 404)

  await db.product.update({ where: { id }, data: { isAvailable: parsed.data.isAvailable } })
  await audit({
    actorRole: parsed.data.actorRole,
    actorRef: parsed.data.actorRef ?? product.store.name,
    action: parsed.data.isAvailable ? 'PRODUCT_AVAILABLE' : 'PRODUCT_SOLD_OUT',
    entityType: 'Product',
    entityId: id,
    meta: { name: product.name, store: product.store.name },
  })
  await emitToRooms({ rooms: ['admin'], event: 'product:update', data: { productId: id, isAvailable: parsed.data.isAvailable } })

  return ok({ id, isAvailable: parsed.data.isAvailable })
}
