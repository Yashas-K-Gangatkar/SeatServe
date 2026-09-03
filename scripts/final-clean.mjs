// FINAL-TEST CLEAN — the owner runs the last loop test with 100% self-created
// real data, so everything test-shaped must go.
// KEEPS: Aurora Mall subtree (cinemas/screens/532 seats/showtimes — QR posters
//        depend on them), asha (MALL_ADMIN) + bhagya (real person; store link
//        detached so the owner can re-assign her to the real store).
// DELETES: the family-test store "milk products" + its products, ANY leftover
//          commerce rows (orders/payments/refunds/splits/settlements/carts/
//          tickets/runs), ALL sessions (everyone re-logs in), ALL audit-log
//          history (fresh operational start — full backup kept first).
// Full JSON backup is written BEFORE anything is deleted. Idempotent.
import pkg from 'pg'
const { Client } = pkg
import { readFileSync, mkdirSync, writeFileSync } from 'fs'

const url = readFileSync('/home/z/my-project/.env.prod-db', 'utf8')
  .split('\n').find((l) => l.startsWith('DATABASE_URL=')).split('=')[1]
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

const MILK = 'cmtk1erje0003l804ax1vkas5'
const dir = '/home/z/my-project/backups/finalclean-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
mkdirSync(dir, { recursive: true })

const backup = async (table, where = '') => {
  const r = await c.query(`SELECT * FROM "${table}" ${where}`)
  writeFileSync(`${dir}/${table}.json`, JSON.stringify(r.rows, null, 1))
  console.log(`backup ${table}${where ? ' (filtered)' : ''}: ${r.rowCount} rows`)
  return r.rowCount
}
const del = async (table, where = 'TRUE', label = '') => {
  const r = await c.query(`DELETE FROM "${table}" WHERE ${where}`)
  console.log(`delete ${table} ${label}: ${r.rowCount} rows`)
  return r.rowCount
}

console.log('=== BACKUP to', dir, '===')
await backup('PaymentEvent'); await backup('Payment'); await backup('Refund')
await backup('Split'); await backup('Settlement'); await backup('DeliveryRun')
await backup('StoreTicket'); await backup('Order'); await backup('OrderItem')
await backup('Cart'); await backup('CartItem')
await backup('Product', `WHERE "storeId" = '${MILK}'`)
await backup('Store', `WHERE id = '${MILK}'`)
await backup('Session'); await backup('AuditLog'); await backup('User')

console.log('=== WIPE (children first) ===')
await c.query('BEGIN')
try {
  await del('PaymentEvent')
  await del('Payment')
  await del('Refund')
  await del('Split')
  await del('Settlement')
  await del('DeliveryRun')
  await del('StoreTicket')
  await del('OrderItem')
  await del('Order')
  await del('CartItem')
  await del('Cart')
  await del('Product', `"storeId" = '${MILK}'`, '(milk products menu)')
  await del('User', `"storeId" = '${MILK}' AND email NOT IN ('asha@seatserve.demo','bhagya@gmail.com')`, '(unexpected strays)')
  await c.query(`UPDATE "User" SET "storeId" = NULL WHERE "storeId" = '${MILK}'`)
  console.log('detach users from milk store: done')
  await del('AuditLog', undefined, '(all — fresh history)')
  await del('Session', undefined, '(all — everyone re-logs in)')
  await del('Store', `id = '${MILK}'`, '(milk products)')
  await c.query('COMMIT')
  console.log('=== COMMITTED ===')
} catch (e) {
  await c.query('ROLLBACK')
  console.error('ROLLED BACK — nothing changed:', e.message)
  await c.end()
  process.exit(1)
}

console.log('=== VERIFY ===')
const v = async (label, q) => console.log(label, (await c.query(q)).rows)
await v('stores remaining:', `SELECT count(*)::int AS n FROM "Store"`)
await v('stores by name:', `SELECT name, "kycStatus" FROM "Store"`)
await v('active users:', `SELECT email, role, "isActive", "storeId" FROM "User" WHERE "isActive" = true`)
await v('orders/payments/splits/settlements:', `SELECT
  (SELECT count(*)::int FROM "Order") AS orders,
  (SELECT count(*)::int FROM "Payment") AS payments,
  (SELECT count(*)::int FROM "Split") AS splits,
  (SELECT count(*)::int FROM "Settlement") AS settlements`)
await v('sessions/auditlog:', `SELECT
  (SELECT count(*)::int FROM "Session") AS sessions,
  (SELECT count(*)::int FROM "AuditLog") AS audit`)
await v('seats kept:', `SELECT count(*)::int AS n FROM "Seat"`)

await c.end()
console.log('\nDone. Platform is blank-slate for the owner-built final test.')
