// GET /api/store/menu?storeId=<id> — menu-management data for the owner console.
// STORE_MANAGER: their own store only. MALL_ADMIN: any store in their mall.
// Without storeId: the list of accessible stores. With storeId: full product list.
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { canAccessStore } from '@/lib/auth'

export async function GET(request: Request) {
  const auth = await requireStaff(request, ['STORE_MANAGER', 'MALL_ADMIN'])
  if ('error' in auth) return auth.error
  const user = auth.user

  const stores = await db.store.findMany({
    where: user.role === 'MALL_ADMIN' ? { mallId: user.mallId ?? '__none__' } : { id: user.storeId ?? '__none__' },
    include: { _count: { select: { products: true } } },
    orderBy: { name: 'asc' },
  })

  const url = new URL(request.url)
  const storeId = url.searchParams.get('storeId')
  const store = storeId ? stores.find((s) => s.id === storeId) : stores[0]
  if (storeId && !store) return fail('Store not found (or outside your scope)', 404)

  if (!store) return ok({ stores: [], store: null, products: [] })

  const products = await db.product.findMany({
    where: { storeId: store.id },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })

  return ok({
    stores: stores.map((s) => ({ id: s.id, name: s.name, emoji: s.emoji, isOpen: s.isOpen, productCount: s._count.products })),
    store: { id: store.id, name: store.name, emoji: store.emoji, isOpen: store.isOpen },
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.category,
      pricePaise: p.pricePaise,
      taxRatePct: p.taxRatePct,
      prepEstimateMin: p.prepEstimateMin,
      isVeg: p.isVeg,
      allergens: p.allergens,
      isAvailable: p.isAvailable,
    })),
  })
}
