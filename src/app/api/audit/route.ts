// GET /api/audit — recent audit trail (staff only; campus/block scoped by session)
import { db } from '@/lib/db'
import { ok } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'

export async function GET(request: Request) {
  const auth = await requireStaff(request, ['CAMPUS_ADMIN', 'BLOCK_MANAGER'])
  if ('error' in auth) return auth.error
  const user = auth.user

  // Audit fix #19: exact campus scoping via the denormalized AuditLog.campusId.
  // The old filter leaked other campuses' Store/Product events when a second campus
  // existed ("sandbox has one campus" assumption). The OR keeps order-bound rows
  // matchable even if an old row predates the campusId column.
  const scopeWhere =
    user.role === 'CAMPUS_ADMIN'
      ? {
          OR: [
            { campusId: user.campusId ?? '__none__' },
            { campusId: null, order: { campusId: user.campusId ?? '__none__' } },
          ],
        }
      : { order: { classroom: { blockId: user.blockId ?? '__none__' } } }

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
