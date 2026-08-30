// GET /api/audit — recent audit trail (staff only; mall/cinema scoped by session)
import { db } from '@/lib/db'
import { ok } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'

export async function GET(request: Request) {
  const auth = await requireStaff(request, ['MALL_ADMIN', 'CINEMA_MANAGER'])
  if ('error' in auth) return auth.error
  const user = auth.user

  // Scope: order-bound events via the order's mall/cinema. Store/product-level
  // events carry no orderId — included for MALL_ADMIN (sandbox has one mall;
  // Phase 4 adds a denormalized mallId column to AuditLog for exact scoping).
  const scopeWhere =
    user.role === 'MALL_ADMIN'
      ? {
          OR: [
            { order: { mallId: user.mallId ?? '__none__' } },
            { order: null, entityType: { in: ['Store', 'Product'] } },
          ],
        }
      : { order: { screen: { cinemaId: user.cinemaId ?? '__none__' } } }

  const logs = await db.auditLog.findMany({
    where: scopeWhere,
    orderBy: { createdAt: 'desc' },
    take: 80,
    include: { order: { select: { code: true } } },
  })
  return ok(
    logs.map((a) => ({
      id: a.id,
      at: a.createdAt,
      actorRole: a.actorRole,
      actorRef: a.actorRef,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      orderCode: a.order?.code ?? null,
      meta: a.meta ? (JSON.parse(a.meta) as Record<string, unknown>) : null,
    })),
  )
}
