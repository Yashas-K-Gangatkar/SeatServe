// Read-only check: tonight's family money-loop state (orders, splits, settlements)
import pkg from 'pg'
const { Client } = pkg
import { readFileSync } from 'fs'

const url = readFileSync('/home/z/my-project/.env.prod-db', 'utf8')
  .split('\n').find(l => l.startsWith('DATABASE_URL=')).split('=')[1]
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

const storeId = 'cmtk1erje0003l804ax1vkas5' // milk products
const orders = (await c.query(
  `SELECT o.id, o."placedAt", o.status, o."paymentStatus", o."totalPaise", o.code
   FROM "Order" o JOIN "OrderItem" oi ON oi."orderId" = o.id
   WHERE oi."storeId"=$1 AND o."placedAt" > now() - interval '6 hours'
   ORDER BY o."placedAt" DESC LIMIT 10`, [storeId])).rows
console.log('recent milk-products orders (6h):', JSON.stringify(orders, null, 1))

const splits = (await c.query(
  `SELECT id, "amountPaise", "commissionPaise", beneficiary, "settlementStatus", "settlementId", "createdAt"
   FROM "Split" WHERE "storeId"=$1 ORDER BY "createdAt" DESC LIMIT 10`, [storeId])).rows
console.log('milk-products splits:', JSON.stringify(splits, null, 1))

const pending = (await c.query(
  `SELECT count(*)::int n, COALESCE(SUM("amountPaise"),0) paise FROM "Split"
   WHERE "storeId"=$1 AND beneficiary='STORE' AND "settlementStatus"='PENDING' AND "settlementId" IS NULL`, [storeId])).rows[0]
console.log('PENDING payable rows:', pending.n, '₹' + pending.paise / 100)

const setts = (await c.query(
  `SELECT s.id, s."amountPaise", s.status, s.utr, s."createdAt", s."processedAt"
   FROM "Settlement" s WHERE s."storeId"=$1 ORDER BY s."createdAt" DESC LIMIT 5`, [storeId])).rows
console.log('milk-products settlements:', JSON.stringify(setts, null, 1))

const allSetts = (await c.query(
  `SELECT count(*)::int n, COALESCE(SUM("amountPaise"),0) paise, min("createdAt") first_at
   FROM "Settlement" WHERE "createdAt" > now() - interval '6 hours'`)).rows[0]
console.log('all-store settlements in last 6h:', allSetts.n, '₹' + allSetts.paise / 100, 'from', allSetts.first_at)
await c.end()
