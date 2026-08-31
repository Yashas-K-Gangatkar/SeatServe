// GET /api/stores — public demo list (kitchen selector, admin toggles reuse overview)
// POST /api/stores — MALL_ADMIN opens a NEW store in their mall (same-mall
// expansion): storefront + its opening menu in one call. The new store starts
// KYC=PENDING (settlement skips payout until verified) and isOpen=true so the
// customer app can list it immediately.
//
// Role boundaries:
//   MALL_ADMIN     — may create stores inside their own mall
//   CINEMA_MANAGER — 403 (cinema ≠ merchant onboarding)
//   STORE_MANAGER  — 403 (they run their own store; they don't open new ones)

import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'

const productSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional(),
  category: z.string().trim().max(30).default('Snacks'),
  pricePaise: z.number().int().min(500).max(500_000), // ₹5 … ₹5000
  taxRatePct: z.number().min(0).max(28).default(5),
  prepEstimateMin: z.number().int().min(1).max(60).default(8),
  isVeg: z.boolean().default(true),
  allergens: z.string().trim().max(80).optional(),
})

const bodySchema = z.object({
  name: z.string().trim().min(2).max(40),
  emoji: z.string().trim().max(8).optional(),
  tagline: z.string().trim().max(80).optional(),
  prepBufferMin: z.number().int().min(0).max(60).default(10),
  commissionPct: z.number().min(0).max(50).default(12),
  products: z.array(productSchema).max(40).default([]),
})

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${base || 'store'}-${Math.random().toString(36).slice(2, 7)}`
}

export async function POST(request: Request) {
  const auth = await requireStaff(request, ['MALL_ADMIN'])
  if ('error' in auth) return auth.error
  const user = auth.user

  if (!user.mallId) return fail('Your admin account is not tied to a mall', 403)

  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error
  const { name, emoji, tagline, prepBufferMin, commissionPct, products } = parsed.data

  // duplicate-name guard within the mall (different malls may share names)
  const mallStores = await db.store.findMany({ where: { mallId: user.mallId }, select: { name: true } })
  const clash = mallStores.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase())
  if (clash) return fail(`A store named "${clash.name}" already exists in your mall`, 409)

  const created = await db.store.create({
    data: {
      mallId: user.mallId,
      name,
      slug: slugify(name),
      emoji: emoji || '🏬',
      tagline: tagline || null,
      prepBufferMin,
      commissionPct,
      isOpen: true,
      products: {
        create: products.map((p) => ({
          name: p.name,
          description: p.description ?? null,
          category: p.category,
          pricePaise: p.pricePaise,
          taxRatePct: p.taxRatePct,
          prepEstimateMin: p.prepEstimateMin,
          isVeg: p.isVeg,
          allergens: p.allergens ?? null,
          isAvailable: true,
        })),
      },
    },
    include: { products: { orderBy: { createdAt: 'asc' } } },
  })

  await audit({
    actorRole: user.role,
    actorRef: user.email ?? user.id,
    action: 'STORE_CREATED',
    entityType: 'Store',
    entityId: created.id,
    mallId: user.mallId,
    meta: { name: created.name, productCount: created.products.length, commissionPct },
  })

  await emitToRooms({
    rooms: [`admin:${user.mallId}`],
    event: 'store:update',
    data: { storeId: created.id, name: created.name },
  })

  return ok(
    {
      store: { id: created.id, name: created.name, slug: created.slug, emoji: created.emoji, productCount: created.products.length },
      message: `${created.name} is live with ${created.products.length} item${created.products.length === 1 ? '' : 's'} — submit KYC before payout day.`,
    },
    201,
  )
}
