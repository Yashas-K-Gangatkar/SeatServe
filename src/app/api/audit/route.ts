// GET /api/audit — recent audit trail (admin)
import { db } from '@/lib/db'
import { ok } from '@/lib/api-helpers'

export async function GET() {
  const logs = await db.auditLog.findMany({
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
