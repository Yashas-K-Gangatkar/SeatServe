// GET /api/orders/[code] — full customer tracking payload (polled + pushed via realtime)
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'
import { cutoffInfo } from '@/lib/cutoff'

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  let { code } = await params
  // paste-tolerant: trim + uppercase; customers routinely paste lowercase or
  // drop the SS- prefix when copying from a popup/notification
  code = code.trim().toUpperCase()
  if (!code.startsWith('SS-')) code = `SS-${code}`

  const order = await db.order.findUnique({
    where: { code: code.replace(/[^A-Z0-9-]/g, '') },
    include: {
      seat: true,
      classroom: { include: { block: { include: { campus: true } }, lectures: true } },
      items: { orderBy: { nameSnapshot: 'asc' } },
      tickets: {
        include: {
          store: { select: { id: true, name: true, emoji: true } },
          deliveryRun: { include: { runner: { select: { name: true, phone: true, rating: true } } } },
        },
      },
      payments: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!order) return fail('Order not found. Check the order ID.', 404)

  const now = new Date()
  const show = order.classroom.lectures.find((s) => s.id === order.lectureId) ?? null
  const cutoff = show ? cutoffInfo(new Date(show.startsAt), show.orderCutoffMinutes, now) : null

  const byStore = new Map<string, typeof order.items>()
  for (const item of order.items) {
    const list = byStore.get(item.storeId) ?? []
    list.push(item)
    byStore.set(item.storeId, list)
  }

  return ok({
    code: order.code,
    status: order.status,
    paymentStatus: order.paymentStatus,
    placedAt: order.placedAt,
    scheduledFor: order.scheduledFor,
    completedAt: order.completedAt,
    location: {
      campus: order.classroom.block.campus.name,
      block: order.classroom.block.name,
      classroom: order.classroom.name,
      seat: order.seat?.code ?? order.seatLabel ?? 'door delivery',
    },
    show: show ? { subject: show.subject, startsAt: show.startsAt, cutoffMinutesUntil: cutoff?.minutesUntilCutoff ?? null } : null,
    totals: {
      subtotalPaise: order.subtotalPaise,
      platformFeePaise: order.platformFeePaise,
      totalPaise: order.totalPaise,
    },
    customer: { name: order.customerName, phone: order.customerPhone },
    stores: order.tickets.map((t) => ({
      ticketId: t.id,
      ticketCode: t.ticketCode,
      storeId: t.storeId,
      storeName: t.store.name,
      emoji: t.store.emoji,
      status: t.status,
      cancelledByRole: t.cancelledByRole,
      prepEtaMinutes: t.prepEtaMinutes,
      items: (byStore.get(t.storeId) ?? []).map((i) => ({
        name: i.nameSnapshot,
        qty: i.qty,
        unitPricePaise: i.unitPricePaise,
        lineTotalPaise: i.lineTotalPaise,
        notes: i.notes,
      })),
      subtotalPaise: t.subtotalPaise,
      deliveryRun: t.deliveryRun
        ? {
            status: t.deliveryRun.status,
            runner: t.deliveryRun.runner.name,
            runnerPhone: t.deliveryRun.runner.phone,
            pickupLabel: t.deliveryRun.pickupLabel,
            dropLabel: t.deliveryRun.dropLabel,
            pickedUpAt: t.deliveryRun.pickedUpAt,
            deliveredAt: t.deliveryRun.deliveredAt,
          }
        : null,
    })),
    payment: order.payments[0]
      ? {
          method: order.payments[0].method,
          status: order.payments[0].status,
          amountPaise: order.payments[0].amountPaise,
          methodDetail: order.payments[0].methodDetail,
          providerRef: order.payments[0].providerRef,
        }
      : null,
    serverTime: now.toISOString(),
  })
}
