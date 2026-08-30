// POST /api/orders/[code]/cancel-leg — Phase 3 partial cancel (customer self-service).
//
// The customer cancels ONE store's leg of a multi-store order while the kitchen
// has not started cooking it (ticket still NEW or ACCEPTED). Everything else in
// the order continues. Money effects (all server-computed, all exact):
//   · ticket → CANCELLED
//   · VOIDED negative split rows for that leg (store never owed the money)
//   · if the order was PAID: an auto-APPROVED refund for
//       legSubtotal + leg delivery fee + leg share of the platform fee
//   · if it was the last active leg: the whole order is CANCELLED
//
// Access model: the order code is a capability (same as tracking) — anyone with
// the code can VIEW; money-affecting actions are additionally guarded by order
// state (PAID, leg not yet PREPARING). Every attempt is audited.

import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'
import { voidStoreLeg } from '@/lib/refunds'

const bodySchema = z.object({
  ticketId: z.string().min(1),
})

const CANCELLABLE_TICKET_STATES = new Set(['NEW', 'ACCEPTED'])

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error

  const order = await db.order.findUnique({
    where: { code: code.toUpperCase() },
    include: { tickets: { include: { store: true, deliveryRun: true } } },
  })
  if (!order) return fail('Order not found', 404)

  if (order.status === 'CANCELLED') return fail('This order is already cancelled', 409)
  if (order.status === 'COMPLETED') return fail('This order is already delivered — use support for a refund', 409)
  // refunds are only meaningful against captured money; unpaid orders can't partially cancel
  if (order.paymentStatus !== 'PAID' && order.paymentStatus !== 'PARTIALLY_REFUNDED') {
    return fail('Only paid orders can be partially cancelled', 409)
  }

  const ticket = order.tickets.find((t) => t.id === parsed.data.ticketId)
  if (!ticket) return fail('That store is not part of this order', 404)
  if (ticket.status === 'CANCELLED') return fail(`${ticket.store.name} was already cancelled`, 409)
  if (!CANCELLABLE_TICKET_STATES.has(ticket.status)) {
    return fail(`${ticket.store.name} is already ${ticket.status.replace('_', ' ').toLowerCase()} — the kitchen has started, so it can no longer be cancelled. Ask support for a refund.`, 409)
  }
  if (ticket.deliveryRun) return fail('A runner is already assigned to this leg', 409)

  // remaining active legs after this one cancels
  const remaining = order.tickets.filter((t) => t.id !== ticket.id && t.status !== 'CANCELLED')

  // 1) cancel the leg (guard against a kitchen transition racing us: only from NEW/ACCEPTED)
  const updated = await db.storeTicket.updateMany({
    where: { id: ticket.id, status: { in: [...CANCELLABLE_TICKET_STATES] } },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  })
  if (updated.count === 0) {
    return fail(`${ticket.store.name} just started preparing — no longer cancellable`, 409)
  }

  // 2) ledger reversal + auto-APPROVED refund (paid orders)
  const reversal = await voidStoreLeg(order.id, ticket.storeId)

  // 3) order-level status
  const orderStatus = remaining.length === 0 ? 'CANCELLED' : 'PARTIALLY_CANCELLED'
  await db.order.update({ where: { id: order.id }, data: { status: orderStatus } })

  await audit({
    actorRole: 'CUSTOMER',
    action: 'ORDER_LEG_CANCELLED',
    entityType: 'StoreTicket',
    entityId: ticket.id,
    orderId: order.id,
    mallId: order.mallId,
    meta: {
      orderCode: order.code,
      storeId: ticket.storeId,
      storeName: ticket.store.name,
      refundTotalPaise: reversal?.refundTotalPaise ?? 0,
      orderStatus,
    },
  })

  // 4) realtime fanout: the store's kitchen, the customer, mall admin
  await emitToRooms({
    rooms: [`order:${order.code}`, `store:${ticket.storeId}`, `admin:${order.mallId}`],
    event: 'ticket:cancelled',
    data: { ticketId: ticket.id, orderCode: order.code, storeName: ticket.store.name },
  })

  return ok({
    orderCode: order.code,
    orderStatus,
    cancelledStore: ticket.store.name,
    refundTotalPaise: reversal?.refundTotalPaise ?? 0,
    remainingStores: remaining.map((t) => t.store.name),
  })
}
