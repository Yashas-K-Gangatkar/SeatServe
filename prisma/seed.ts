/**
 * SeatServe — demo seed.
 * One mall · two cinemas · six screens · seats with unique QR tokens ·
 * four stores · showtimes (incl. one past-cutoff to demo the blocked state) ·
 * runners · role-based users · settings · two pre-built orders so that the
 * staff dashboards are not empty on first open.
 *
 * Run: bun run db:seed
 */
import { PrismaClient } from '@prisma/client'
import { computeBill, DEFAULT_PLATFORM, type StoreLineGroup } from '../src/lib/pricing'
import { generateTicketCode, generatePaymentRef, generateQrToken } from '../src/lib/ids'
import { hashPassword } from '../src/lib/auth'

type DB = PrismaClient

const minutes = (n: number) => new Date(Date.now() + n * 60_000)
const hours = (n: number) => minutes(n * 60)

export async function seedDemoData(db: DB): Promise<void> {
  // ── wipe (FK-safe order) ─────────────────────────────────────────
  await db.auditLog.deleteMany()
  await db.paymentEvent.deleteMany()
  await db.payment.deleteMany()
  await db.refund.deleteMany()
  await db.split.deleteMany()
  await db.settlement.deleteMany()
  await db.deliveryRun.deleteMany()
  await db.storeTicket.deleteMany()
  await db.orderItem.deleteMany()
  await db.order.deleteMany()
  await db.cartItem.deleteMany()
  await db.cart.deleteMany()
  await db.user.deleteMany()
  await db.runner.deleteMany()
  await db.product.deleteMany()
  await db.store.deleteMany()
  await db.showtime.deleteMany()
  await db.seat.deleteMany()
  await db.screen.deleteMany()
  await db.cinema.deleteMany()
  await db.deliveryZone.deleteMany()
  await db.mall.deleteMany()
  await db.appSetting.deleteMany()

  // ── venues ───────────────────────────────────────────────────────
  const mall = await db.mall.create({
    data: { name: 'Aurora Mall', city: 'Mumbai', address: 'Linking Road, Bandra West, Mumbai 400050' },
  })

  // SECOND MALL — proves multi-mall isolation end-to-end (orders, context,
  // runner queue, admin scoping are all tested across the mall boundary).
  const mall2 = await db.mall.create({
    data: { name: 'Nexora Mall', city: 'Pune', address: 'Nagar Road, Yerawada, Pune 411006' },
  })

  const zoneA = await db.deliveryZone.create({ data: { mallId: mall.id, name: 'Zone A · Wing A (Screens 1–3)' } })
  const zoneB = await db.deliveryZone.create({ data: { mallId: mall.id, name: 'Zone B · Wing B (Screens 4–6)' } })
  const zoneN = await db.deliveryZone.create({ data: { mallId: mall2.id, name: 'Zone N · Nexora levels 1–3' } })

  const cinemaA = await db.cinema.create({
    data: { mallId: mall.id, name: 'Aurora Cineplex — Wing A', wing: 'A' },
  })
  const cinemaB = await db.cinema.create({
    data: { mallId: mall.id, name: 'Aurora Cineplex — Wing B', wing: 'B' },
  })

  const ROWS = ['A', 'B', 'C', 'D', 'E', 'F']
  const COLS = 12

  // QR tokens are RANDOM (10 chars, confusion-free alphabet) — a printed QR is
  // a capability: being able to guess another seat's token would let anyone
  // order to / read that seat. Deterministic A1-A1-style tokens were removed
  // in the logical-mistake fix round for exactly that reason.
  async function createScreen(cinemaId: string, screenNum: number, name: string, rows = ROWS, cols = COLS) {
    return db.screen.create({
      data: {
        cinemaId,
        name,
        seatRows: rows.length,
        seatCols: cols,
        seats: {
          create: rows.flatMap((row, r) =>
            Array.from({ length: cols }, (_, c) => ({
              code: `${row}-${c + 1}`,
              rowLabel: row,
              seatNumber: c + 1,
              qrToken: generateQrToken(),
            })),
          ),
        },
      },
      include: { seats: true },
    })
  }

  const screen1 = await createScreen(cinemaA.id, 1, 'Screen 1')
  const screen2 = await createScreen(cinemaA.id, 2, 'Screen 2')
  const screen3 = await createScreen(cinemaA.id, 3, 'Screen 3')
  const screen4 = await createScreen(cinemaB.id, 4, 'Screen 4')
  const screen5 = await createScreen(cinemaB.id, 5, 'Screen 5')
  const screen6 = await createScreen(cinemaB.id, 6, 'Screen 6')

  const cinemaN = await db.cinema.create({
    data: { mallId: mall2.id, name: 'Nexora Cinemas', wing: 'N' },
  })
  const screenN1 = await createScreen(cinemaN.id, 1, 'Nexora Screen 1', ['A', 'B', 'C', 'D'], 8)

  // Showtimes — Screen 1 starts in 20 min ⇒ 30-min cutoff already passed (blocked demo,
  // demoAutoRoll=false keeps it permanently demonstrable via the demo-roll guardian)
  const st = (screenId: string, movieTitle: string, language: string, startsAt: Date, cutoff = 30, demoAutoRoll = true) =>
    db.showtime.create({ data: { screenId, movieTitle, language, startsAt, orderCutoffMinutes: cutoff, demoAutoRoll } })

  const show1 = await st(screen1.id, 'Vikram Damaka', 'Hindi', minutes(20), 30, false) // BLOCKED (demo)
  await st(screen2.id, 'Kalki 2899 AD — Rerun', 'Telugu (dub. Hindi)', hours(3))
  const show3 = await st(screen3.id, 'Brahmāstra Part Two: Dev', 'Hindi', hours(2)) // hero
  await st(screen4.id, 'RRR: Encore', 'Telugu', hours(2.5))
  await st(screen5.id, 'Jawan Returns', 'Hindi', hours(4))
  await st(screen6.id, '3 Idiots — Classic Night', 'Hindi', hours(2))
  await st(screenN1.id, 'Kantara Chapter 2', 'Kannada (dub. Hindi)', hours(2.5))

  // ── stores & products ────────────────────────────────────────────
  const snacks = await db.store.create({
    data: {
      mallId: mall.id,
      name: 'Cinema Snacks',
      slug: 'cinema-snacks',
      tagline: 'Popcorn, nachos & chai since 2009',
      emoji: '🍿',
      prepBufferMin: 8,
      deliveryFeePaise: 1900,
      commissionPct: 12,
      kycStatus: 'VERIFIED',
      bankRefMasked: 'XXXX4821',
      rating: 4.6,
    },
  })
  const pizza = await db.store.create({
    data: {
      mallId: mall.id,
      name: 'Pizza Corner',
      slug: 'pizza-corner',
      tagline: 'Wood-fired, delivered to your recliner',
      emoji: '🍕',
      prepBufferMin: 12,
      deliveryFeePaise: 2900,
      commissionPct: 14,
      kycStatus: 'VERIFIED',
      bankRefMasked: 'XXXX9032',
      rating: 4.4,
    },
  })
  const wraps = await db.store.create({
    data: {
      mallId: mall.id,
      name: 'Wrap House',
      slug: 'wrap-house',
      tagline: 'Rolls, wraps & fries',
      emoji: '🌯',
      prepBufferMin: 10,
      deliveryFeePaise: 2500,
      commissionPct: 13,
      kycStatus: 'VERIFIED',
      bankRefMasked: 'XXXX1177',
      rating: 4.5,
    },
  })
  const mithai = await db.store.create({
    data: {
      mallId: mall.id,
      name: 'Mithai & More',
      slug: 'mithai-more',
      tagline: 'Indian sweets & filter coffee',
      emoji: '🍮',
      prepBufferMin: 8,
      deliveryFeePaise: 1900,
      commissionPct: 10,
      kycStatus: 'PENDING',
      bankRefMasked: null,
      rating: 4.7,
    },
  })

  type P = { storeId: string; name: string; description: string; category: string; pricePaise: number; prepEstimateMin: number; isVeg: boolean; allergens?: string; taxRatePct?: number }
  // GST classes (India, restaurant/confectionery): packaged-beverage drinks 12%,
  // most hot food / sweets 5%. Flagged in the audit — everything was 5% before.
  const products: P[] = [
    { storeId: snacks.id, name: 'Salted Popcorn (L)', description: 'Classic theatre popcorn, popped fresh', category: 'Popcorn', pricePaise: 18000, prepEstimateMin: 5, isVeg: true },
    { storeId: snacks.id, name: 'Butter Popcorn (L)', description: 'Extra butter, extra happiness', category: 'Popcorn', pricePaise: 22000, prepEstimateMin: 5, isVeg: true, allergens: 'dairy' },
    { storeId: snacks.id, name: 'Nachos with Cheese', description: 'Crunchy totopos + warm cheese dip', category: 'Snacks', pricePaise: 24000, prepEstimateMin: 7, isVeg: true, allergens: 'dairy, gluten' },
    { storeId: snacks.id, name: 'Cold Coffee', description: 'Iced, frothy, slightly sweet', category: 'Beverages', pricePaise: 14000, prepEstimateMin: 4, isVeg: true, allergens: 'dairy', taxRatePct: 12 },
    { storeId: snacks.id, name: 'Samosa (2 pc)', description: 'Spiced potato, crisp pastry', category: 'Snacks', pricePaise: 7000, prepEstimateMin: 6, isVeg: true },
    { storeId: snacks.id, name: 'Masala Chai', description: 'Cutting chai, ginger forward', category: 'Beverages', pricePaise: 8000, prepEstimateMin: 4, isVeg: true, taxRatePct: 12 },
    { storeId: pizza.id, name: 'Margherita (10")', description: 'Tomato, mozzarella, basil', category: 'Pizza', pricePaise: 25000, prepEstimateMin: 14, isVeg: true, allergens: 'dairy, gluten' },
    { storeId: pizza.id, name: 'Farmhouse (10")', description: 'Capsicum, onion, corn, paneer', category: 'Pizza', pricePaise: 32000, prepEstimateMin: 15, isVeg: true, allergens: 'dairy, gluten' },
    { storeId: pizza.id, name: 'Paneer Tikka Pizza', description: 'Smoky paneer tikka chunks', category: 'Pizza', pricePaise: 33000, prepEstimateMin: 15, isVeg: true, allergens: 'dairy, gluten' },
    { storeId: pizza.id, name: 'Garlic Bread Sticks', description: 'Buttery, herby, shareable', category: 'Sides', pricePaise: 15000, prepEstimateMin: 8, isVeg: true, allergens: 'gluten, dairy' },
    { storeId: wraps.id, name: 'Paneer Tikka Wrap', description: 'Char-grilled paneer, mint chutney', category: 'Wraps', pricePaise: 21000, prepEstimateMin: 10, isVeg: true, allergens: 'gluten, dairy' },
    { storeId: wraps.id, name: 'Chicken Seekh Wrap', description: 'Minced chicken seekh, onions', category: 'Wraps', pricePaise: 24000, prepEstimateMin: 12, isVeg: false },
    { storeId: wraps.id, name: 'Veg Burrito', description: 'Rice, beans, salsa, sour cream', category: 'Wraps', pricePaise: 19000, prepEstimateMin: 9, isVeg: true, allergens: 'gluten, dairy' },
    { storeId: wraps.id, name: 'Peri Peri Fries', description: 'Crispy fries, fiery dust', category: 'Sides', pricePaise: 11000, prepEstimateMin: 6, isVeg: true },
    { storeId: mithai.id, name: 'Gulab Jamun (2 pc)', description: 'Warm, rose-scented syrup', category: 'Sweets', pricePaise: 8000, prepEstimateMin: 3, isVeg: true, allergens: 'dairy, nuts' },
    { storeId: mithai.id, name: 'Rasmalai (2 pc)', description: 'Saffron milk, pistachio', category: 'Sweets', pricePaise: 12000, prepEstimateMin: 3, isVeg: true, allergens: 'dairy, nuts' },
    { storeId: mithai.id, name: 'Kaju Katli (250g)', description: 'Silver-leafed cashew fudge', category: 'Sweets', pricePaise: 28000, prepEstimateMin: 4, isVeg: true, allergens: 'nuts' },
    { storeId: mithai.id, name: 'Filter Coffee', description: 'Dabara-tumbler, strong', category: 'Beverages', pricePaise: 7000, prepEstimateMin: 5, isVeg: true, allergens: 'dairy', taxRatePct: 12 },
  ]
  for (const p of products) await db.product.create({ data: p })

  // ── second-mall store (Nexora · Pune) ────────────────────────────
  const dosa = await db.store.create({
    data: {
      mallId: mall2.id,
      name: 'Dosa Junction',
      slug: 'dosa-junction',
      tagline: 'Crisp dosas, filter kaapi, Pune style',
      emoji: '🥞',
      prepBufferMin: 9,
      deliveryFeePaise: 1900,
      commissionPct: 11,
      kycStatus: 'VERIFIED',
      bankRefMasked: 'XXXX5510',
      rating: 4.6,
    },
  })
  const dosaProducts: P[] = [
    { storeId: dosa.id, name: 'Masala Dosa', description: 'Classic potato-filled crisp dosa', category: 'Dosa', pricePaise: 12000, prepEstimateMin: 10, isVeg: true, allergens: 'gluten, dairy' },
    { storeId: dosa.id, name: 'Cheese Burst Dosa', description: 'Molten cheese, spicy chutney', category: 'Dosa', pricePaise: 16000, prepEstimateMin: 12, isVeg: true, allergens: 'gluten, dairy' },
    { storeId: dosa.id, name: 'Mysore Filter Kaapi', description: 'Bold South-Indian coffee', category: 'Beverages', pricePaise: 6000, prepEstimateMin: 5, isVeg: true, allergens: 'dairy', taxRatePct: 12 },
  ]
  for (const p of dosaProducts) await db.product.create({ data: p })

  // ── runners & users ──────────────────────────────────────────────
  // Phase 2: every staff user gets a demo password + tenant scope.
  // All demo accounts share the password "demo1234" (sandbox only).
  const DEMO_PASSWORD = 'demo1234'
  const demoHash = await hashPassword(DEMO_PASSWORD)

  const r1 = await db.runner.create({ data: { name: 'Ravi Kumar', phone: '+91 98200 11111', zoneId: zoneA.id, rating: 4.8 } })
  const r2 = await db.runner.create({ data: { name: 'Sana Sheikh', phone: '+91 98200 22222', zoneId: zoneB.id, rating: 4.9 } })
  await db.runner.create({ data: { name: 'Arjun Das', phone: '+91 98200 33333', zoneId: zoneA.id, rating: 4.6, isOnDuty: false } })
  const rN = await db.runner.create({ data: { name: 'Kiran Patil', phone: '+91 98200 44444', zoneId: zoneN.id, rating: 4.7 } })

  await db.user.create({ data: { name: 'Asha Rao', phone: '+91 90000 00001', email: 'asha@seatserve.demo', role: 'MALL_ADMIN', mallId: mall.id, passwordHash: demoHash } })
  await db.user.create({ data: { name: 'Vikram Mehta', phone: '+91 90000 00002', email: 'vikram@aurora.demo', role: 'CINEMA_MANAGER', mallId: mall.id, cinemaId: cinemaA.id, passwordHash: demoHash } })
  for (const s of [snacks, pizza, wraps, mithai]) {
    await db.user.create({ data: { name: `${s.name} Manager`, phone: `+91 9000${s.slug.length} 1100`, email: `manager@${s.slug}.demo`, role: 'STORE_MANAGER', storeId: s.id, passwordHash: demoHash } })
    await db.user.create({ data: { name: `${s.name} Kitchen`, phone: `+91 9000${s.slug.length} 2200`, email: `kitchen@${s.slug}.demo`, role: 'KITCHEN_STAFF', storeId: s.id, passwordHash: demoHash } })
  }
  await db.user.create({ data: { name: 'Ravi Kumar', phone: '+91 90000 00003', email: 'ravi@runner.demo', role: 'RUNNER', runnerId: r1.id, mallId: mall.id, passwordHash: demoHash } })
  await db.user.create({ data: { name: 'Sana Sheikh', phone: '+91 90000 00004', email: 'sana@runner.demo', role: 'RUNNER', runnerId: r2.id, mallId: mall.id, passwordHash: demoHash } })
  await db.user.create({ data: { name: 'Priya Sharma', phone: '+91 90000 00005', role: 'CUSTOMER' } })

  // second-mall staff — their boards must show NOTHING from Aurora
  await db.user.create({ data: { name: 'Meera Iyer', phone: '+91 91000 00001', email: 'meera@nexora.demo', role: 'MALL_ADMIN', mallId: mall2.id, passwordHash: demoHash } })
  await db.user.create({ data: { name: 'Dosa Junction Manager', phone: '+91 91000 00002', email: 'manager@dosa-junction.demo', role: 'STORE_MANAGER', storeId: dosa.id, passwordHash: demoHash } })
  await db.user.create({ data: { name: 'Dosa Junction Kitchen', phone: '+91 91000 00003', email: 'kitchen@dosa-junction.demo', role: 'KITCHEN_STAFF', storeId: dosa.id, passwordHash: demoHash } })
  await db.user.create({ data: { name: 'Kiran Patil', phone: '+91 91000 00004', email: 'kiran@runner.demo', role: 'RUNNER', runnerId: rN.id, mallId: mall2.id, passwordHash: demoHash } })

  // ── settings ─────────────────────────────────────────────────────
  await db.appSetting.create({ data: { key: 'platform_fee', value: JSON.stringify(DEFAULT_PLATFORM) } })
  await db.appSetting.create({ data: { key: 'ordering_cutoff_default_minutes', value: JSON.stringify(30) } })
  await db.appSetting.create({ data: { key: 'payment_fee_pct', value: JSON.stringify(2) } })

  // ── pre-built orders (so staff dashboards are never empty) ───────
  const seatsOf = (screen: { seats: { id: string; code: string }[] }, code: string) =>
    screen.seats.find((s) => s.code === code)!

  const storeFee = (s: { id: string; commissionPct: number; deliveryFeePaise: number; prepBufferMin: number }) => ({
    commissionPct: s.commissionPct,
    deliveryFeePaise: s.deliveryFeePaise,
    prepBufferMin: s.prepBufferMin,
  })

  const mkOrder = async (opts: {
    screen: typeof screen3
    seatCode: string
    showtimeId: string | null
    placedAt: Date
    code: string
    customerName: string
    groups: {
      store: { id: string; name: string; commissionPct: number; deliveryFeePaise: number; prepBufferMin: number }
      items: { name: string; unitPricePaise: number; qty: number; taxRatePct: number; prepEstimateMin: number; notes?: string }[]
    }[]
    ticketStatus: 'NEW' | 'DELIVERED'
    runnerId?: string
  }) => {
    const seat = seatsOf(opts.screen, opts.seatCode)
    const groups: StoreLineGroup[] = opts.groups.map((g) => ({
      storeId: g.store.id,
      prepMinutes: g.items.map((i) => i.prepEstimateMin),
      fees: storeFee(g.store),
      lines: g.items.map((i) => ({ unitPricePaise: i.unitPricePaise, qty: i.qty, taxRatePct: i.taxRatePct })),
    }))
    const bill = computeBill(groups)

    const order = await db.order.create({
      data: {
        code: opts.code,
        mallId: mall.id,
        cinemaId: opts.screen.cinemaId,
        screenId: opts.screen.id,
        seatId: seat.id,
        showtimeId: opts.showtimeId,
        status: opts.ticketStatus === 'DELIVERED' ? 'COMPLETED' : 'PAID',
        paymentStatus: 'PAID',
        subtotalPaise: bill.subtotalPaise,
        taxPaise: bill.taxPaise,
        deliveryFeePaise: bill.deliveryFeePaise,
        platformFeePaise: bill.platformFeePaise,
        totalPaise: bill.totalPaise,
        customerName: opts.customerName,
        customerPhone: '+91 90000 00005',
        placedAt: opts.placedAt,
        completedAt: opts.ticketStatus === 'DELIVERED' ? new Date(opts.placedAt.getTime() + 26 * 60_000) : null,
      },
    })

    for (const g of opts.groups) {
      const subtotal = g.items.reduce((s, i) => s + i.unitPricePaise * i.qty, 0)
      for (const item of g.items) {
        await db.orderItem.create({
          data: {
            orderId: order.id,
            storeId: g.store.id,
            nameSnapshot: item.name,
            unitPricePaise: item.unitPricePaise,
            qty: item.qty,
            taxRatePct: item.taxRatePct,
            lineTotalPaise: item.unitPricePaise * item.qty,
            notes: item.notes ?? null,
          },
        })
      }
      const done = opts.ticketStatus === 'DELIVERED'
      const ticket = await db.storeTicket.create({
        data: {
          orderId: order.id,
          storeId: g.store.id,
          ticketCode: generateTicketCode(),
          status: opts.ticketStatus,
          subtotalPaise: subtotal,
          prepEtaMinutes: bill.prepEstimateMinutes,
          acceptedAt: done ? opts.placedAt : null,
          preparingAt: done ? opts.placedAt : null,
          readyAt: done ? opts.placedAt : null,
          pickedUpAt: done ? opts.placedAt : null,
          deliveredAt: done ? opts.placedAt : null,
        },
      })
      if (done && opts.runnerId) {
        await db.deliveryRun.create({
          data: {
            ticketId: ticket.id,
            runnerId: opts.runnerId,
            status: 'DELIVERED',
            pickupLabel: `${g.store.name} · Food court, ground floor`,
            dropLabel: `${opts.screen.name} · Seat ${opts.seatCode} · ${opts.screen.cinemaId === cinemaA.id ? 'Wing A' : 'Wing B'}`,
            assignedAt: opts.placedAt,
            pickedUpAt: opts.placedAt,
            deliveredAt: opts.placedAt,
          },
        })
      }
      const storeBill = bill.perStore.find((ps) => ps.storeId === g.store.id)!
      await db.split.create({
        data: {
          orderId: order.id,
          storeId: g.store.id,
          beneficiary: 'STORE',
          amountPaise: storeBill.storeNetPaise,
          settlementStatus: done ? 'SETTLED' : 'PENDING',
        },
      })
      if (done) {
        // consistent demo ledger: settled splits get a real Settlement row
        await db.settlement.create({
          data: {
            storeId: g.store.id,
            amountPaise: storeBill.storeNetPaise,
            periodStart: new Date(opts.placedAt.getTime() - 3600_000),
            periodEnd: new Date(opts.placedAt.getTime() + 3600_000),
            status: 'PROCESSED',
            utr: `UTR${generatePaymentRef().slice(-12).toUpperCase()}`,
          },
        })
      }
    }

    const commissionTotal = bill.perStore.reduce((s, p) => s + p.commissionPaise, 0)
    const done = opts.ticketStatus === 'DELIVERED'
    for (const b of [
      { beneficiary: 'TAX' as const, amountPaise: bill.taxPaise },
      { beneficiary: 'PLATFORM_COMMISSION' as const, amountPaise: bill.platformFeePaise + commissionTotal },
      { beneficiary: 'DELIVERY_FEE' as const, amountPaise: bill.deliveryFeePaise },
    ]) {
      await db.split.create({
        data: { orderId: order.id, storeId: null, beneficiary: b.beneficiary, amountPaise: b.amountPaise, settlementStatus: done ? 'SETTLED' : 'PENDING' },
      })
    }

    await db.payment.create({
      data: {
        orderId: order.id,
        provider: 'SANDBOX_MOCK',
        method: 'UPI',
        amountPaise: bill.totalPaise,
        status: 'SUCCESS',
        providerRef: generatePaymentRef(),
        idempotencyKey: `seed_${opts.code}`,
        methodDetail: 'priya@okhdfcbank',
      },
    })
    return order
  }

  // yesterday's completed order (Screen 3 · A-1): popcorn + coffee from Cinema Snacks
  await mkOrder({
    screen: screen3,
    seatCode: 'A-1',
    showtimeId: null,
    placedAt: new Date(Date.now() - 26 * 3600_000),
    code: 'SS-DEMO01',
    customerName: 'Rohan Verma',
    groups: [
      {
        store: snacks,
        items: [
          { name: 'Salted Popcorn (L)', unitPricePaise: 18000, qty: 1, taxRatePct: 5, prepEstimateMin: 5 },
          { name: 'Cold Coffee', unitPricePaise: 14000, qty: 1, taxRatePct: 12, prepEstimateMin: 4 },
        ],
      },
    ],
    ticketStatus: 'DELIVERED',
    runnerId: r1.id,
  })

  // live PAID order right now (Screen 3 · E-4): pizza + wraps, tickets NEW
  await mkOrder({
    screen: screen3,
    seatCode: 'E-4',
    showtimeId: show3.id,
    placedAt: new Date(Date.now() - 2 * 60_000),
    code: 'SS-DEMO02',
    customerName: 'Priya Sharma',
    groups: [
      {
        store: pizza,
        items: [{ name: 'Margherita (10")', unitPricePaise: 25000, qty: 1, taxRatePct: 5, prepEstimateMin: 14 }],
      },
      {
        store: wraps,
        items: [
          { name: 'Paneer Tikka Wrap', unitPricePaise: 21000, qty: 1, taxRatePct: 5, prepEstimateMin: 10, notes: 'No onion — allergy' },
          { name: 'Peri Peri Fries', unitPricePaise: 11000, qty: 2, taxRatePct: 5, prepEstimateMin: 6 },
        ],
      },
    ],
    ticketStatus: 'NEW',
  })

  return
}

const isDirectRun = process.argv[1]?.includes('seed')
if (isDirectRun) {
  const db = new PrismaClient()
  seedDemoData(db)
    .then(() => {
      console.log('✅ SeatServe demo data seeded')
      return db.$disconnect()
    })
    .catch((err) => {
      console.error('❌ Seed failed:', err)
      process.exit(1)
    })
}
