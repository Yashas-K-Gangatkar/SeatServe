// POST /api/store/products — create a menu item (owner console).
// STORE_MANAGER (own store) or MALL_ADMIN (own mall). Audited; realtime-pushed
// to the admin board. New items start AVAILABLE unless explicitly added as sold out.
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { canAccessStore } from '@/lib/auth'
import { audit } from '@/lib/audit'

const bodySchema = z.object({
  storeId: z.string().min(1),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(140).optional().or(z.literal('')),
  category: z.string().trim().min(2).max(30).default('Snacks'),
  pricePaise: z.number().int().min(100).max(10_000_00),
  taxRatePct: z.number().min(0).max(28).default(5),
  prepEstimateMin: z.number().int().min(1).max(60).default(8),
  isVeg: z.boolean().default(true),
  allergens: z.string().trim().max(80).optional().or(z.literal('')),
  isAvailable: z.boolean().default(true),
})

export async function POST(request: Request) {
  const auth = await requireStaff(request, ['STORE_MANAGER', 'MALL_ADMIN'])
  if ('error' in auth) return auth.error
  const user = auth.user

  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error
  const input = parsed.data

  const store = await db.store.findUnique({ where: { id: input.storeId } })
  if (!store) return fail('Store not found', 404)
  if (!canAccessStore(user, { id: store.id, mallId: store.mallId })) {
    return fail('Your account is not authorized for this store', 403)
  }

  // keep the menu sane: no duplicate names inside one store
  const dupe = await db.product.findFirst({ where: { storeId: store.id, name: { equals: input.name, } } })
  if (dupe) return fail(`"${input.name}" is already on your menu`, 409)

  const product = await db.product.create({
    data: {
      storeId: store.id,
      name: input.name,
      description: input.description || null,
      category: input.category,
      pricePaise: input.pricePaise,
      taxRatePct: input.taxRatePct,
      prepEstimateMin: input.prepEstimateMin,
      isVeg: input.isVeg,
      allergens: input.allergens || null,
      isAvailable: input.isAvailable,
    },
  })

  await audit({
    actorRole: user.role,
    actorRef: user.email ?? user.id,
    action: 'PRODUCT_CREATED',
    entityType: 'Product',
    entityId: product.id,
    mallId: store.mallId,
    meta: { name: product.name, store: store.name, pricePaise: product.pricePaise, isAvailable: product.isAvailable },
  })

  return ok({
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    pricePaise: product.pricePaise,
    taxRatePct: product.taxRatePct,
    prepEstimateMin: product.prepEstimateMin,
    isVeg: product.isVeg,
    allergens: product.allergens,
    isAvailable: product.isAvailable,
  })
}
