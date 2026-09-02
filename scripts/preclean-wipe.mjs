// PRECLEAN BACKUP + WIPE — removes ALL test/demo commerce data, keeps real things.
// KEEPS: landing reviews/testimonials (code, untouched), store ratings, mom's store
//        "milk products" + its menu (the family-loop store), bhagya, admin logins,
//        screens/seats/showtimes (QR posters depend on them), audit history.
// DELETES: demo stores (Cinema Snacks, Pizza Corner, Wrap House, Mithai & More) +
//          their products, ALL orders/items/payments/refunds/splits/settlements/
//          carts/tickets/delivery runs, demo @seatserve.demo non-admin staff.
import pkg from 'pg'
const { Client } = pkg
import { readFileSync, mkdirSync, writeFileSync } from 'fs'

const url = readFileSync('/home/z/my-project/.env.prod-db', 'utf8')
  .split('\n').find(l => l.startsWith('DATABASE_URL=')).split('=')[1]
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

const MILK = 'cmtk1erje0003l804ax1vkas5'
const dir = '/home/z/my-project/backups/preclean-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
mkdirSync(dir, { recursive: true })

const hasCol = async (t, col) =>
  (await c.query(`SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`, [t, col])).rowCount > 0

const backup = async (table, where = '') => {
  const r = await c.query(`SELECT * FROM "${table}" ${where}`)
  writeFileSync(`${dir}/${table}.json`, JSON.stringify(r.rows, null, 1))
  console.log(`backup ${table}: ${r.rowCount} rows`)
  return r.rowCount
}

const del = async (table, where = 'TRUE', label = '') => {
  const r = await c.query(`DELETE FROM "${table}" WHERE ${where}`)
  console.log(`delete ${table} ${label}: ${r.rowCount} rows`)
  return r.rowCount
}

console.log('=== BACKUP to', dir, '===')
await backup('Order'); await backup('OrderItem'); await backup('Payment'); await backup('PaymentEvent')
await backup('Refund'); await backup('Split'); await backup('Settlement'); await backup('StoreTicket')
await backup('Cart'); await backup('CartItem')
if (await hasCol('DeliveryRun', 'orderId') || true) await backup('DeliveryRun')
await backup('Product', `WHERE "storeId" != '${MILK}'`)
await backup('Store', `WHERE id != '${MILK}'`)
await backup('Runner')
await backup('User', `WHERE email LIKE '%@seatserve.demo' AND role != 'MALL_ADMIN'`)
if (await hasCol('DeliveryZone', 'storeId')) await backup('DeliveryZone', `WHERE "storeId" != '${MILK}'`)

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
  // demo products + zones of deleted stores
  await del('Product', `"storeId" != '${MILK}'`, '(demo stores)')
  if (await hasCol('DeliveryZone', 'storeId')) await del('DeliveryZone', `"storeId" != '${MILK}'`, '(demo stores)')
  // demo runners tied to deleted stores (or unscoped demo runners) — detach/delete
  if (await hasCol('Runner', 'storeId')) await del('Runner', `"storeId" IS NULL OR "storeId" != '${MILK}'`, '(demo)')
  // detach staff still pointing at deleted stores
  await c.query(`UPDATE "User" SET "storeId"=NULL WHERE "storeId" IS NOT NULL AND "storeId" != '${MILK}'`)
  // demo staff (keep MALL_ADMIN logins + real Gmail accounts)
  await del('User', `email LIKE '%@seatserve.demo' AND role != 'MALL_ADMIN'`, '(demo kitchen/runner staff)')
  // demo stores
  await del('Store', `id != '${MILK}'`, '(demo stores)')
  await c.query('COMMIT')
  console.log('COMMIT OK')
} catch (e) {
  await c.query('ROLLBACK')
  console.log('ROLLED BACK — error:', e.message)
  process.exit(1)
}

console.log('=== VERIFY ===')
const stores = (await c.query(`SELECT name, "kycStatus", "commissionPct" FROM "Store"`)).rows
console.log('stores left:', JSON.stringify(stores))
const staff = (await c.query(`SELECT name, email, role, "storeId" IS NOT NULL AS has_store, "isActive" FROM "User" ORDER BY role`)).rows
for (const s of staff) console.log(`staff: ${s.name} | ${s.email} | ${s.role} | store=${s.has_store} | active=${s.isActive}`)
for (const t of ['Order', 'Payment', 'Split', 'Settlement', 'Product', 'Cart', 'StoreTicket']) {
  const n = (await c.query(`SELECT count(*)::int n FROM "${t}"`)).rows[0].n
  console.log(`count ${t}: ${n}`)
}
const menu = (await c.query(`SELECT name, "pricePaise" FROM "Product" WHERE "storeId"=$1`, [MILK])).rows
console.log('milk products menu:', menu.map(m => `${m.name} ₹${m.pricePaise / 100}`).join(' | '))
await c.end()
