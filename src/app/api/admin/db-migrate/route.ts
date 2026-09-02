// POST /api/admin/db-migrate — one-shot idempotent schema migration.
// MALL_ADMIN only. Adds columns the running code expects when the platform's
// normal migration channel (prisma db push) has not reached the database yet.
// Safe to call repeatedly: every statement is IF NOT EXISTS / additive only.
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { Prisma } from '@prisma/client'

export async function POST(request: Request) {
  const auth = await requireStaff(request, ['MALL_ADMIN'])
  if ('error' in auth) return auth.error

  const statements = [
    Prisma.sql`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT`,
  ]

  try {
    for (const stmt of statements) {
      await db.$executeRaw(stmt)
    }
  } catch (e) {
    return fail(`Migration failed: ${e instanceof Error ? e.message : 'unknown'}`, 500)
  }

  return ok({ applied: statements.length, note: 'Product.imageUrl ensured' })
}
