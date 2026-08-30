// GET /api/audit — recent audit trail (staff only; mall/cinema scoped by session)
import { db } from '@/lib/db'
import { ok } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'

export async function GET(request: Request) {
  const auth = await requireStaff(request, ['MALL_ADMIN', 'CINEMA_MANAGER'])
  if ('error' in auth) return auth.error
  const user = auth.user

  // Audit fix #19: exact mall scoping via the denormalized AuditLog.mallId.
  // The old filter leaked other malls' Store/Product events when a second mall
  // existed ("sandbox has one mall" assumption). The OR keeps order-bound rows
  // matchable even if an old row predates the mallId column.
  const scopeWhere =
    user.role === 'MALL_ADMIN'
      ? {
          OR: [
            { mallId: user.mallId ?? '__none__' },
            { mallId: null, order: { mallId: user.mallId ?? '__none__' } },
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
