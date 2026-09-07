// Inspect production hierarchy: campuses, stores, staff users, and the
// dependency counts that a demo-mall purge must walk before deleting.
// Run with the Postgres client + DATABASE_URL from .env.prod-db.
import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

const env = Object.fromEntries(
  readFileSync('/home/z/my-project/.env.prod-db', 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)
process.env.DATABASE_URL = env.DATABASE_URL

const db = new PrismaClient()

async function main() {
  const campuses = await db.campus.findMany({ orderBy: { createdAt: 'asc' } })
  console.log('== CAMPUSES (createdAt asc — first is the sheet-sync default) ==')
  for (const c of campuses) {
    const [stores, blocks, zones, orders, users] = await Promise.all([
      db.store.count({ where: { campusId: c.id } }),
      db.block.count({ where: { campusId: c.id } }),
      db.deliveryZone.count({ where: { campusId: c.id } }),
      db.order.count({ where: { campusId: c.id } }),
      db.user.count({ where: { campusId: c.id } }),
    ])
    console.log(
      `${c.id}  "${c.name}"  city=${c.city}  created=${c.createdAt.toISOString()}  stores=${stores} blocks=${blocks} zones=${zones} orders=${orders} users=${users}`,
    )
  }

  console.log('\n== STORES ==')
  const stores = await db.store.findMany({ select: { id: true, name: true, campusId: true, slug: true, _count: { select: { products: true, users: true } } }, orderBy: { createdAt: 'asc' } })
  for (const s of stores) console.log(`${s.id}  "${s.name}"  campus=${s.campusId}  slug=${s.slug}  products=${s._count.products} users=${s._count.users}`)

  console.log('\n== STAFF USERS ==')
  const users = await db.user.findMany({
    where: { role: { not: 'CUSTOMER' } },
    select: { id: true, name: true, email: true, role: true, campusId: true, storeId: true, blockId: true, runnerId: true, isActive: true },
  })
  for (const u of users) {
    console.log(
      `${u.id}  ${u.email ?? '-'}  ${u.role}  campus=${u.campusId ?? '-'} store=${u.storeId ?? '-'} block=${u.blockId ?? '-'} runner=${u.runnerId ?? '-'} active=${u.isActive}  ${u.name}`,
    )
  }

  console.log('\n== GLOBAL COUNTS ==')
  const counts = {
    blocks: await db.block.count(),
    classrooms: await db.classroom.count(),
    seats: await db.seat.count(),
    lectures: await db.lecture.count(),
    zones: await db.deliveryZone.count(),
    runners: await db.runner.count(),
    orders: await db.order.count(),
    orderItems: await db.orderItem.count(),
    products: await db.product.count(),
    payments: await db.payment.count(),
    splits: await db.split.count(),
    settlements: await db.settlement.count(),
    tickets: await db.storeTicket.count(),
    deliveryRuns: await db.deliveryRun.count(),
    auditLogs: await db.auditLog.count(),
    sessions: await db.session.count(),
    carts: await db.cart.count(),
    cartItems: await db.cartItem.count(),
    users: await db.user.count(),
  }
  console.log(JSON.stringify(counts, null, 1))
}

main()
  .catch((e) => {
    console.error('INSPECT FAILED:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
