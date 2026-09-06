// GET /api/admin/reconciliation — ledger invariant report (R1–R5).
// CAMPUS_ADMIN: whole campus · BLOCK_MANAGER: their block's orders only.

import { db } from '@/lib/db'
import { ok } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { reconcileOrders } from '@/lib/reconcile'

export async function GET(request: Request) {
  const auth = await requireStaff(request, ['CAMPUS_ADMIN', 'BLOCK_MANAGER'])
  if ('error' in auth) return auth.error
  const user = auth.user

  let scopeMallId: string | null = null
  let orderWhere: Record<string, unknown> = {}

  if (user.role === 'CAMPUS_ADMIN') {
    scopeMallId = user.campusId ?? '__none__'
  } else {
    // BLOCK_MANAGER — reconciliation runs over their block's orders
    const block = user.blockId
      ? await db.block.findUnique({ where: { id: user.blockId }, select: { campusId: true } })
      : null
    scopeMallId = block?.campusId ?? null
    orderWhere = { classroom: { blockId: user.blockId ?? '__none__' } }
  }

  // reconcileOrders scopes by campus; for block managers we further filter by
  // running it campus-wide then filtering is wasteful — instead pass campus scope
  // and rely on R-checks being per-order. For exactness the block manager's
  // report is the campus report intersected with their orders:
  const report = await reconcileOrders(scopeMallId)
  if (user.role === 'BLOCK_MANAGER') {
    const blockOrders = new Set(
      (await db.order.findMany({ where: orderWhere, select: { code: true } })).map((o) => o.code),
    )
    const blockIssues = report.issues.filter((i) => blockOrders.has(i.orderCode))
    return ok({
      ...report,
      scope: { ...report.scope, mallName: report.scope.mallName ? `${report.scope.mallName} (your block's orders)` : null },
      issues: blockIssues,
      healthy: blockIssues.length === 0,
      ordersChecked: blockOrders.size,
    })
  }

  return ok(report)
}
