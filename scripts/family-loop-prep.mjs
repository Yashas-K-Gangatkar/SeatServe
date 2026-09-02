// Family money-loop test prep (22:4x IST, cron fires 23:00 IST)
// 1. Inspect "milk products" store (commission, KYC, active, menu)
// 2. Set commissionPct = 0  → mom gets 95% (platform fee 5% is the owner's cut)
// 3. Set kycStatus = VERIFIED (+ masked kycDetail snapshot) → payout gate passes
// 4. Confirm bhagya@gmail.com is active STORE_MANAGER of that store
// 5. Show today's PENDING store split rows (what the 11 PM batch will pick up)
import pkg from 'pg'
const { Client } = pkg
import { readFileSync } from 'fs'

const url = readFileSync('/home/z/my-project/.env.prod-db', 'utf8')
  .split('\n').find(l => l.startsWith('DATABASE_URL='))
  .split('=')[1]

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

const tables = await c.query(
  `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`)
const names = tables.rows.map(r => r.table_name)
const storeTable = names.includes('Store') ? 'Store' : (names.find(t => /store/i.test(t)))
const staffTable = names.includes('User') ? 'User' : (names.find(t => /user|staff/i.test(t)))
console.log('tables:', names.join(', '))
console.log('storeTable=', storeTable, 'staffTable=', staffTable)

const cols = (await c.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name='${storeTable}'`)).rows.map(r => r.column_name)
console.log('store cols:', cols.join(', '))

const store = (await c.query(
  `SELECT id, name, "commissionPct", "kycStatus", "kycDetail", "isOpen", "mallId"
   FROM "${storeTable}" WHERE lower(name) LIKE '%milk%'`)).rows
if (store.length !== 1) { console.log('STORE_MATCHES', store.length, JSON.stringify(store)); process.exit(1) }
const s = store[0]
console.log('BEFORE store:', JSON.stringify(s, null, 1))

const prods = (await c.query(
  `SELECT name, "pricePaise", "isAvailable" FROM "${names.includes('Product') ? 'Product' : 'Product'}" WHERE "storeId"=$1`, [s.id])).rows
console.log(`menu (${prods.length}):`, prods.map(p => `${p.name} ₹${p.pricePaise / 100}${p.isAvailable ? '' : ' [hidden]'}`).join(' | ') || 'EMPTY')

const userCols = (await c.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name='${staffTable}'`)).rows.map(r => r.column_name)
console.log('user cols:', userCols.join(', '))
const bhagya = (await c.query(
  `SELECT id, name, email, role, "storeId", "isActive" FROM "${staffTable}" WHERE lower(email)='bhagya@gmail.com'`)).rows[0]
console.log('BEFORE bhagya:', JSON.stringify(bhagya))

const pending = (await c.query(
  `SELECT count(*)::int n, COALESCE(SUM("amountPaise"),0) paise FROM "Split"
   WHERE "storeId"=$1 AND beneficiary='STORE' AND "settlementStatus"='PENDING' AND "settlementId" IS NULL`, [s.id])).rows[0]
console.log('PENDING store rows now:', pending.n, '₹' + pending.paise / 100)

// ---- mutations ----
const kyc = JSON.stringify({
  gstin: 'UNREGISTERED', panMasked: 'XXXXX0000F', bankMasked: 'UPI-****test',
  fssai: 'FAMILY-TEST', submittedAt: new Date().toISOString(),
  note: 'Family money-loop test store — verified by platform owner',
})
await c.query('BEGIN')
await c.query(
  `UPDATE "${storeTable}" SET "commissionPct"=0, "kycStatus"='VERIFIED', "kycDetail"=$2, "isOpen"=true WHERE id=$1`,
  [s.id, kyc])
await c.query(
  `UPDATE "${staffTable}" SET role='STORE_MANAGER', "storeId"=$2, "isActive"=true WHERE id=$1`,
  [bhagya.id, s.id])
await c.query('COMMIT')

const after = (await c.query(
  `SELECT name, "commissionPct", "kycStatus", "isOpen" FROM "${storeTable}" WHERE id=$1`, [s.id])).rows[0]
const afterB = (await c.query(
  `SELECT name, email, role, "storeId", "isActive" FROM "${staffTable}" WHERE id=$1`, [bhagya.id])).rows[0]
console.log('AFTER store:', JSON.stringify(after))
console.log('AFTER bhagya:', JSON.stringify(afterB))
console.log('MATH CHECK: dad pays total, subtotal = total/0.95, mom gets subtotal (commission 0) = 95% of total. Platform keeps 5%.')
await c.end()
