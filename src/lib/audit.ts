// SeatServe — audit trail writer. Every money/state-relevant action lands here.
import { db } from '@/lib/db'

export interface AuditEntry {
  actorRole: string // CUSTOMER | KITCHEN_STAFF | RUNNER | MALL_ADMIN | SYSTEM | GATEWAY
  actorRef?: string
  action: string
  entityType: string
  entityId: string
  meta?: unknown
  orderId?: string
}

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorRole: entry.actorRole,
        actorRef: entry.actorRef ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        meta: entry.meta === undefined ? null : JSON.stringify(entry.meta),
        orderId: entry.orderId ?? null,
      },
    })
  } catch (err) {
    // audit must never break the business flow; log to server console as backup
    console.error('[audit] failed to write entry', entry.action, err)
  }
}
