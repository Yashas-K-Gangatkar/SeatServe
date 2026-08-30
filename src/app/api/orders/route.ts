// POST /api/orders — create an order (multi-store, single cart) for a seat.
// Server-side authority: cutoff, availability, money math. Client never computes totals.
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { pickCurrentShow } from '@/lib/showtime'
import { computeBill, computeSplits, type StoreLineGroup } from '@/lib/pricing'
import { getSettings } from '@/lib/settings'
import { generateOrderCode, generateTicketCode } from '@/lib/ids'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'
import { rollStaleShowtimes } from '@/lib/demo-roll'

const bodySchema = z.object({
  qrToken: z.string().min(4),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        qty: z.number().int().min(1).max(20),
        notes: z.string().max(200).optional(),
      }),
    )
    .min(1, 'Add at least one item'),
  customerName: z.string().max(80).optional(),
  customerPhone: z.string().max(20).optional(),
})

export async function POST(request: Request) {
  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error
  const { qrToken, items, customerName, customerPhone } = parsed.data

  const seat = await db.seat.findUnique({
    where: { qrToken },
    include: { screen: { include: { cinema: true } } },
  })
  if (!seat) return fail('Unknown seat QR', 404)

  // Sandbox demo guardian: keep stale showtimes usable (see lib/demo-roll.ts)
  await rollStaleShowtimes(seat.screenId)
  const screenShowtimes = await db.showtime.findMany({
    where: { screenId: seat.screenId, isActive: true },
    orderBy: { startsAt: 'asc' },
  })

  const now = new Date()
  // Audit fix #20: pick the earliest show whose cutoff is STILL OPEN (falls
  // back to the blocked-state demo show inside the 3h window) — never an
  // already-started show while a later orderable show exists.
  const picked = pickCurrentShow(screenShowtimes, now)
  const show = picked.show
  if (!show) return fail('No active showtime for this screen right now.', 409)

  const info = picked.info!
  if (!info.orderingOpen) {
    return fail(
      `Ordering is closed for this show. The cutoff was ${info.cutoffAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.`,
      423, // Locked
    )
  }

  // validate items — availability, store openness AND same-mall isolation
  // (Audit fix #12: a seat in Mall A could previously order from a store in
  // Mall B because the store's mallId was never compared to the seat's mall.)
  const mallId = seat.screen.cinema.mallId
  const productIds = items.map((i) => i.productId)
  const products = await db.product.findMany({ where: { id: { in: productIds } }, include: { store: true } })
  const byId = new Map(products.map((p) => [p.id, p]))
  for (const item of items) {
    const p = byId.get(item.productId)
    if (!p) return fail(`Unknown product: ${item.productId}`, 404)
    if (p.store.mallId !== mallId) {
      return fail(`"${p.name}" is from a store outside this mall and cannot be delivered to your seat.`, 409)
    }
    if (!p.isAvailable) return fail(`"${p.name}" is sold out right now.`, 409)
    if (!p.store.isOpen) return fail(`${p.store.name} is closed right now.`, 409)
  }

  // group per store
  const groupsMap = new Map<string, { product: (typeof products)[number]; qty: number; notes?: string }[]>()
  for (const item of items) {
    const p = byId.get(item.productId)!
    const list = groupsMap.get(p.storeId) ?? []
    list.push({ product: p, qty: item.qty, notes: item.notes })
    groupsMap.set(p.storeId, list)
  }

  const settings = await getSettings()
  const lineGroups: StoreLineGroup[] = [...groupsMap.entries()].map(([storeId, list]) => ({
    storeId,
    prepMinutes: list.map((x) => x.product.prepEstimateMin),
    fees: {
      commissionPct: list[0].product.store.commissionPct,
      deliveryFeePaise: list[0].product.store.deliveryFeePaise,
      prepBufferMin: list[0].product.store.prepBufferMin,
    },
    lines: list.map((x) => ({ unitPricePaise: x.product.pricePaise, qty: x.qty, taxRatePct: x.product.taxRatePct })),
  }))
  const bill = computeBill(lineGroups, settings.platformFee)

  const code = generateOrderCode()
  const order = await db.order.create({
    data: {
      code,
      mallId: seat.screen.cinema.mallId,
      cinemaId: seat.screen.cinema.id,
      screenId: seat.screen.id,
      seatId: seat.id,
      showtimeId: show.id,
      status: 'PENDING_PAYMENT',
      paymentStatus: 'PENDING',
      subtotalPaise: bill.subtotalPaise,
      taxPaise: bill.taxPaise,
      deliveryFeePaise: bill.deliveryFeePaise,
      platformFeePaise: bill.platformFeePaise,
      totalPaise: bill.totalPaise,
      customerName: customerName ?? null,
      customerPhone: customerPhone ?? null,
      items: {
        create: [...groupsMap.values()].flatMap((list) =>
          list.map((x) => ({
            productId: x.product.id,
            storeId: x.product.storeId,
            nameSnapshot: x.product.name,
            unitPricePaise: x.product.pricePaise,
            qty: x.qty,
            taxRatePct: x.product.taxRatePct,
            lineTotalPaise: x.product.pricePaise * x.qty,
            notes: x.notes ?? null,
          })),
        ),
      },
      tickets: {
        create: [...groupsMap.keys()].map((storeId) => {
          const store = products.find((p) => p.storeId === storeId)!.store
          return {
            storeId,
            ticketCode: generateTicketCode(),
            status: 'NEW',
            subtotalPaise: bill.perStore.find((s) => s.storeId === storeId)!.subtotalPaise,
            prepEtaMinutes: bill.prepEstimateMinutes,
            customerNote: null,
          } as { storeId: string; ticketCode: string; status: 'NEW'; subtotalPaise: number; prepEtaMinutes: number; customerNote: null }
        }),
      },
      splits: {
        create: computeSplits(bill).map((s) => ({
          storeId: s.storeId,
          beneficiary: s.beneficiary,
          amountPaise: s.amountPaise,
          commissionPaise: s.commissionPaise,
          taxPaise: s.taxPaise,
          settlementStatus: 'PENDING',
        })),
      },
    },
    include: { tickets: true, items: true },
  })

  await audit({
    actorRole: 'CUSTOMER',
    action: 'ORDER_CREATED',
    entityType: 'Order',
    entityId: order.id,
    orderId: order.id,
    mallId: order.mallId,
    meta: { code, totalPaise: bill.totalPaise, stores: [...groupsMap.keys()] },
  })

  return ok(
    {
      code: order.code,
      status: order.status,
      paymentStatus: order.paymentStatus,
      breakdown: bill,
      itemCount: items.reduce((s, i) => s + i.qty, 0),
      seat: { code: seat.code, screen: seat.screen.name, cinema: seat.screen.cinema.name },
      cutoff: { cutoffAt: info.cutoffAt, minutesUntilCutoff: info.minutesUntilCutoff },
    },
    201,
  )
}
