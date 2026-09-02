// Full money audit: dad's payment → splits → 23:25 settlement batch → payouts
import pkg from 'pg'
const { Client } = pkg
import { readFileSync } from 'fs'

const url = readFileSync('/home/z/my-project/.env.prod-db', 'utf8')
  .split('\n').find(l => l.startsWith('DATABASE_URL=')).split('=')[1]
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

const milk = 'cmtk1erje0003l804ax1vkas5'

console.log('=== 1. milk products orders (last 3h) ===')
const orders = (await c.query(
  `SELECT o.code, o.status, o."paymentStatus", o."subtotalPaise", o."platformFeePaise", o."totalPaise", o."placedAt",
          s.name AS store
   FROM "Order" o
   JOIN "OrderItem" oi ON oi."orderId" = o.id
   JOIN "Store" s ON s.id = oi."storeId"
   WHERE oi."storeId"=$1 AND o."placedAt" > now() - interval '3 hours'
   ORDER BY o."placedAt" DESC`, [milk])).rows
for (const o of orders) {
  console.log(`${o.code} | ${o.status} | pay=${o.paymentStatus} | items ₹${o.subtotalPaise / 100} + fee ₹${o.platformFeePaise / 100} = dad paid ₹${o.totalPaise / 100} | ${o.placedAt?.toISOString?.() || o.placedAt}`)
}
if (orders.length === 0) console.log('(none)')

console.log('=== 2. milk products Split ledger (all recent) ===')
const splits = (await c.query(
  `SELECT beneficiary, "amountPaise", "commissionPaise", "settlementStatus", "settlementId", "createdAt"
   FROM "Split" WHERE "storeId"=$1 ORDER BY "createdAt" DESC LIMIT 12`, [milk])).rows
for (const s of splits) {
  console.log(`${s.beneficiary} | ₹${s.amountPaise / 100} | commission ₹${s.commissionPaise / 100} | ${s.settlementStatus} | batch=${s.settlementId ? s.settlementId.slice(-6) : '—'}`)
}
if (splits.length === 0) console.log('(none)')

console.log('=== 3. Settlement batches (last 3h, all stores) ===')
const setts = (await c.query(
  `SELECT s.id, st.name AS store, s."amountPaise", s.status, s.utr, s."createdAt", s.detail
   FROM "Settlement" s JOIN "Store" st ON st.id = s."storeId"
   WHERE s."createdAt" > now() - interval '3 hours'
   ORDER BY s."createdAt" DESC`)).rows
for (const s of setts) {
  const d = s.detail ? JSON.parse(s.detail) : {}
  console.log(`${s.store} | payout ₹${s.amountPaise / 100} | ${s.status} | utr=${s.utr || '—'} | gross ₹${(d.grossPaise || 0) / 100} commission ₹${(d.commissionPaise || 0) / 100} | ${s.createdAt?.toISOString?.() || s.createdAt}`)
}
if (setts.length === 0) console.log('(none — batch not run yet)')

console.log('=== 4. PENDING payable rows per store (what next batch would pay) ===')
const pend = (await c.query(
  `SELECT st.name, count(*)::int n, SUM(sp."amountPaise") paise
   FROM "Split" sp JOIN "Store" st ON st.id = sp."storeId"
   WHERE sp.beneficiary='STORE' AND sp."settlementStatus"='PENDING' AND sp."settlementId" IS NULL AND sp."amountPaise" > 0
   GROUP BY st.name ORDER BY st.name`)).rows
for (const p of pend) console.log(`${p.name}: ${p.n} rows, ₹${p.paise / 100}`)
if (pend.length === 0) console.log('(nothing pending anywhere)')

console.log('=== 5. Payments (last 3h) ===')
const pays = (await c.query(
  `SELECT p.provider, p.status, p."amountPaise", p."createdAt", o.code
   FROM "Payment" p JOIN "Order" o ON o.id = p."orderId"
   WHERE p."createdAt" > now() - interval '3 hours' ORDER BY p."createdAt" DESC LIMIT 10`)).rows
for (const p of pays) console.log(`${p.code} | ${p.provider} | ${p.status} | ₹${p.amountPaise / 100}`)
if (pays.length === 0) console.log('(none)')

console.log('=== 6. Money audit events (last 3h) ===')
const audits = (await c.query(
  `SELECT action, "entityType", "actorRole", "createdAt" FROM "AuditLog"
   WHERE "createdAt" > now() - interval '3 hours' AND (action LIKE 'SETTLEMENT%' OR action LIKE 'PAYMENT%' OR action LIKE 'PRODUCT_REPRICED%' OR action LIKE 'KYC%')
   ORDER BY "createdAt" DESC LIMIT 15`)).rows
for (const a of audits) console.log(`${a.action} (${a.entityType}) by ${a.actorRole} at ${a.createdAt?.toISOString?.() || a.createdAt}`)
if (audits.length === 0) console.log('(none)')

await c.end()
console.log('=== done ===')
