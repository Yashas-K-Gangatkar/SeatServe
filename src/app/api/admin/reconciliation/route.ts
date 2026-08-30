// GET /api/admin/reconciliation — ledger invariant report (R1–R5).
// MALL_ADMIN: whole mall · CINEMA_MANAGER: their cinema's orders only.

import { db } from '@/lib/db'
import { ok } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { reconcileOrders } from '@/lib/reconcile'

export async function GET(request: Request) {
  const auth = await requireStaff(request, ['MALL_ADMIN', 'CINEMA_MANAGER'])
  if ('error' in auth) return auth.error
  const user = auth.user

  let scopeMallId: string | null = null
  let orderWhere: Record<string, unknown> = {}

  if (user.role === 'MALL_ADMIN') {
    scopeMallId = user.mallId ?? '__none__'
  } else {
    // CINEMA_MANAGER — reconciliation runs over their cinema's orders
    const cinema = user.cinemaId
      ? await db.cinema.findUnique({ where: { id: user.cinemaId }, select: { mallId: true } })
      : null
    scopeMallId = cinema?.mallId ?? null
    orderWhere = { screen: { cinemaId: user.cinemaId ?? '__none__' } }
  }

  // reconcileOrders scopes by mall; for cinema managers we further filter by
  // running it mall-wide then filtering is wasteful — instead pass mall scope
  // and rely on R-checks being per-order. For exactness the cinema manager's
  // report is the mall report intersected with their orders:
  const report = await reconcileOrders(scopeMallId)
  if (user.role === 'CINEMA_MANAGER') {
    const cinemaOrders = new Set(
      (await db.order.findMany({ where: orderWhere, select: { code: true } })).map((o) => o.code),
    )
    const cinemaIssues = report.issues.filter((i) => cinemaOrders.has(i.orderCode))
    return ok({
      ...report,
      scope: { ...report.scope, mallName: report.scope.mallName ? `${report.scope.mallName} (your cinema's orders)` : null },
      issues: cinemaIssues,
      healthy: cinemaIssues.length === 0,
      ordersChecked: cinemaOrders.size,
    })
  }

  return ok(report)
}
