// purge-demo-malls — remove the cinema-era demo tenants, keep the real ones.
//
// Owner request: "about the Aurora Mall remove all the thing related to this".
//
// What it does (idempotent — safe to re-run):
//   1. DELETE whole demo campuses (--delete "Name" — repeatable):
//        Nova Degree College (demo wizard campus) — campus row + blocks +
//        classrooms + seats + lectures + zones + demo store + demo user.
//   2. RENAME the Aurora campus in place → "Wraphouse" (Bengaluru):
//        Wraphouse Kitchen (the owner's REAL store), its staff (bhagya, ravi,
//        priya) and the real Yashas campus-admin accounts survive untouched —
//        same row IDs, so the renamed campus becomes the sheet-sync default
//        campus (oldest row) that blank-Campus roster rows resolve to.
//   3. Inside the renamed campus, delete only the DEMO leftovers:
//        stores Chai + Chicken (+ products), demo users asha/chef/runner/
//        ramesh @demo (and the demo Runner row), demo blocks/classrooms/
//        seats/lectures, demo zones/runners, demo orders with their tickets/
//        payments/splits/events — everything a cinema demo left behind.
//
// DRY by default: run without --execute to print the plan.
// LOCAL (sqlite sandbox):  bun scripts/purge-demo-malls.mjs
// PROD (Postgres):         bun scripts/purge-demo-malls.mjs --prod --execute
//                          (needs the Postgres client + .env.prod-db)
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'

// Prod URL is ONLY loaded when --prod is passed explicitly — otherwise the
// sandbox DATABASE_URL (file:…custom.db) from the environment is used, so the
// script can never touch production by accident.
if (process.argv.includes('--prod')) {
  const f = readFileSync('/home/z/my-project/.env.prod-db', 'utf8')
  const line = f.split('\n').find((l) => l.startsWith('DATABASE_URL='))
  if (line) process.env.DATABASE_URL = line.slice('DATABASE_URL='.length).trim()
  else throw new Error('--prod but no DATABASE_URL in .env.prod-db')
}

const db = new PrismaClient()
const EXECUTE = process.argv.includes('--execute')
const CAMPUS_FROM = 'Aurora Mall'
const CAMPUS_RENAME_TO = 'Wraphouse'
const KEEP_STORES = ['Wraphouse Kitchen']
const DELETE_CAMPUSES = ['Nova Degree College']
// demo-only users under the renamed campus (explicit emails — real humans like
// the Yashas trio or Wraphouse staff are NEVER in this list)
const PURGE_USER_EMAILS = ['asha@seatserve.demo', 'chef@wraphouse.serve', 'runner@wraphouse.serve', 'ramesh@wraphouse.serve']

const norm = (s) => s.trim().toLowerCase()
let deleted = {}

async function count(label, fn) {
  const r = await fn()
  const n = typeof r === 'number' ? r : (r?.count ?? 0)
  deleted[label] = (deleted[label] ?? 0) + n
  return n
}

async function deleteOrdersFor(campusId, label) {
  const orders = await db.order.findMany({ where: { campusId }, select: { id: true } })
  const orderIds = orders.map((o) => o.id)
  if (orderIds.length === 0) return
  await count(`${label}:deliveryRuns`, () => db.deliveryRun.deleteMany({ where: { ticket: { orderId: { in: orderIds } } } }))
  await count(`${label}:storeTickets`, () => db.storeTicket.deleteMany({ where: { orderId: { in: orderIds } } }))
  const payments = await db.payment.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } })
  const paymentIds = payments.map((p) => p.id)
  if (paymentIds.length > 0) {
    await count(`${label}:paymentEvents`, () => db.paymentEvent.deleteMany({ where: { paymentId: { in: paymentIds } } }))
    await count(`${label}:payments`, () => db.payment.deleteMany({ where: { id: { in: paymentIds } } }))
  }
  await count(`${label}:splits`, () => db.split.deleteMany({ where: { orderId: { in: orderIds } } }))
  await count(`${label}:auditLogs(order)`, () => db.auditLog.deleteMany({ where: { orderId: { in: orderIds } } }))
  await count(`${label}:orderItems`, () => db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } }))
  await count(`${label}:orders`, () => db.order.deleteMany({ where: { id: { in: orderIds } } }))
}

async function deleteClassroomsFor(campusId, label) {
  const blocks = await db.block.findMany({ where: { campusId }, select: { id: true } })
  const blockIds = blocks.map((b) => b.id)
  if (blockIds.length === 0) return
  const classrooms = await db.classroom.findMany({ where: { blockId: { in: blockIds } }, select: { id: true } })
  const roomIds = classrooms.map((c) => c.id)
  if (roomIds.length === 0) return
  await count(`${label}:lectures`, () => db.lecture.deleteMany({ where: { classroomId: { in: roomIds } } }))
  await count(`${label}:seats`, () => db.seat.deleteMany({ where: { classroomId: { in: roomIds } } }))
  await count(`${label}:classrooms`, () => db.classroom.deleteMany({ where: { id: { in: roomIds } } }))
  await count(`${label}:blocks`, () => db.block.deleteMany({ where: { id: { in: blockIds } } }))
}

/** Delete users (+ their sessions + runner rows + user audit meta) by id. */
async function deleteUsers(users, label) {
  if (users.length === 0) return
  const ids = users.map((u) => u.id)
  await count(`${label}:sessions`, () => db.session.deleteMany({ where: { userId: { in: ids } } }))
  const runnerIds = users.map((u) => u.runnerId).filter(Boolean)
  await count(`${label}:users`, () => db.user.deleteMany({ where: { id: { in: ids } } }))
  if (runnerIds.length > 0) await count(`${label}:runnerRows`, () => db.runner.deleteMany({ where: { id: { in: runnerIds } } }))
  await db.auditLog.deleteMany({ where: { entityType: 'User', entityId: { in: ids } } }).then((r) => {
    deleted[`${label}:userAuditMeta`] = (deleted[`${label}:userAuditMeta`] ?? 0) + r.count
  })
}

async function deleteStores(stores, label) {
  if (stores.length === 0) return
  const ids = stores.map((s) => s.id)
  await count(`${label}:settlements`, () => db.settlement.deleteMany({ where: { storeId: { in: ids } } }))
  await count(`${label}:splits(store)`, () => db.split.deleteMany({ where: { storeId: { in: ids } } }))
  await count(`${label}:orderItems(store)`, () => db.orderItem.deleteMany({ where: { storeId: { in: ids } } }))
  await count(`${label}:storeTickets(store)`, () => db.storeTicket.deleteMany({ where: { storeId: { in: ids } } }))
  await count(`${label}:products`, () => db.product.deleteMany({ where: { storeId: { in: ids } } }))
  await count(`${label}:stores`, () => db.store.deleteMany({ where: { id: { in: ids } } }))
}

async function main() {
  const campuses = await db.campus.findMany({ orderBy: { createdAt: 'asc' } })
  console.log('Campuses now:', campuses.map((c) => `"${c.name}"`).join(', '))
  const aurora = campuses.find((c) => norm(c.name) === norm(CAMPUS_FROM))
  if (!aurora) console.log(`(rename) campus "${CAMPUS_FROM}" not found — already renamed?`)

  // ── plan ────────────────────────────────────────────────────────────
  const doomed = campuses.filter((c) => DELETE_CAMPUSES.some((n) => norm(n) === norm(c.name)))
  for (const c of doomed) {
    const [stores, blocks, users, orders] = await Promise.all([
      db.store.count({ where: { campusId: c.id } }),
      db.block.count({ where: { campusId: c.id } }),
      db.user.count({ where: { campusId: c.id } }),
      db.order.count({ where: { campusId: c.id } }),
    ])
    console.log(`PLAN delete campus "${c.name}": stores=${stores} blocks=${blocks} users=${users} orders=${orders}`)
  }
  if (aurora) {
    const stores = await db.store.findMany({ where: { campusId: aurora.id } })
    const users = await db.user.findMany({ where: { campusId: aurora.id, email: { in: PURGE_USER_EMAILS } } })
    console.log(`PLAN rename campus "${aurora.name}" → "${CAMPUS_RENAME_TO}"; keep stores: ${stores.filter((s) => KEEP_STORES.includes(s.name)).map((s) => s.name).join(', ') || '—'}; delete stores: ${stores.filter((s) => !KEEP_STORES.includes(s.name)).map((s) => s.name).join(', ') || '—'}; delete demo users: ${users.map((u) => u.email).join(', ') || '—'}`)
  }
  if (!EXECUTE) {
    console.log('\nDRY RUN — nothing written. Re-run with --execute to apply.')
    return
  }

  // ── 1. whole-campus deletes ─────────────────────────────────────────
  for (const c of doomed) {
    const label = `nova(${c.name.slice(0, 10)})`
    const stores = await db.store.findMany({ where: { campusId: c.id } })
    await deleteOrdersFor(c.id, label)
    await deleteStores(stores, label)
    const users = await db.user.findMany({ where: { campusId: c.id } })
    await deleteUsers(users, label) // after orders — a DeliveryRun may reference the user's Runner row
    await deleteClassroomsFor(c.id, label)
    await count(`${label}:runners(zone)`, () => db.runner.deleteMany({ where: { zone: { campusId: c.id } } }))
    await count(`${label}:zones`, () => db.deliveryZone.deleteMany({ where: { campusId: c.id } }))
    await count(`${label}:auditLogs(campus)`, () => db.auditLog.deleteMany({ where: { campusId: c.id } }))
    await db.campus.delete({ where: { id: c.id } })
    deleted[`${label}:campus`] = 1
  }

  // ── 2. Aurora → Wraphouse: purge demo leftovers, keep the real store ─
  if (aurora) {
    const label = 'aurora'
    const keptStores = await db.store.findMany({ where: { campusId: aurora.id, name: { in: KEEP_STORES } } })
    const doomedStores = await db.store.findMany({ where: { campusId: aurora.id, id: { notIn: keptStores.map((s) => s.id) } } })

    const demoUsers = await db.user.findMany({ where: { campusId: aurora.id, email: { in: PURGE_USER_EMAILS } } })

    await deleteOrdersFor(aurora.id, label) // demo orders FIRST — their DeliveryRuns reference the demo Runner row
    await deleteStores(doomedStores, label)
    await deleteUsers(demoUsers, label) // after orders/runs — safe to drop the demo Runner row now
    await deleteClassroomsFor(aurora.id, label)
    await count(`${label}:runners(zone)`, () => db.runner.deleteMany({ where: { zone: { campusId: aurora.id } } }))
    await count(`${label}:zones`, () => db.deliveryZone.deleteMany({ where: { campusId: aurora.id } }))

    await db.campus.update({
      where: { id: aurora.id },
      data: { name: CAMPUS_RENAME_TO, city: 'Bengaluru', address: 'Wraphouse Kitchen, Bengaluru' },
    })
    deleted[`${label}:campusRenamed`] = 1
  }

  console.log('\nDELETED:', JSON.stringify(deleted, null, 1))

  // ── 3. verify the surviving tree ────────────────────────────────────
  const after = await db.campus.findMany({ orderBy: { createdAt: 'asc' } })
  console.log('\nCampuses after:', JSON.stringify(after.map((c) => ({ name: c.name, city: c.city })), null, 1))
  for (const c of after) {
    const stores = await db.store.findMany({ where: { campusId: c.id }, select: { name: true, _count: { select: { products: true, users: true } } } })
    const users = await db.user.findMany({ where: { campusId: c.id }, select: { email: true, role: true, isActive: true } })
    console.log(`\n"${c.name}": stores=${JSON.stringify(stores.map((s) => `${s.name}(${s._count.products}p/${s._count.users}u)`))}`)
    console.log(`  staff: ${users.map((u) => `${u.email}<${u.role}${u.isActive ? '' : ',INACTIVE'}>`).join(', ') || '—'}`)
  }
}

main()
  .catch((e) => {
    console.error('PURGE FAILED (nothing beyond the failed step was committed):', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
