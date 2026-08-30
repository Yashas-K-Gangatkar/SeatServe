// GET /api/stores — public demo list (kitchen selector, admin toggles reuse overview)
import { db } from '@/lib/db'
import { ok } from '@/lib/api-helpers'

export async function GET() {
  const stores = await db.store.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true, emoji: true, tagline: true, isOpen: true, kycStatus: true, rating: true, deliveryFeePaise: true },
  })
  return ok(stores)
}
