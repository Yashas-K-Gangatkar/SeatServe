// Read-only prod DB probe: WHY is the owner's Google sign-in bouncing?
// 1. staff User rows (email/role/isActive) — especially gmail ones
// 2. recent LOGIN_GOOGLE* AuditLog rows — server-side rejection reasons
// Secrets never printed; DATABASE_URL read from .env.prod-db (gitignored).
import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = readFileSync('/home/z/my-project/.env.prod-db', 'utf8').match(/DATABASE_URL=(.+)/)?.[1]?.trim()
if (!url) { console.error('no DATABASE_URL in .env.prod-db'); process.exit(1) }
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()

console.log('== Table inventory ==')
const tables = await client.query(
  `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`,
)
console.log('  ' + tables.rows.map((t) => t.table_name).join(', '))

const cols = await client.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name='User' ORDER BY ordinal_position`,
)
const userCols = cols.rows.map((c) => c.column_name)
console.log('\n== User columns ==\n  ' + userCols.join(', '))

const pick = (...names) => names.filter((n) => userCols.includes(n)).map((n) => `"${n}"`).join(', ') ?? '*'
const roleCol = userCols.includes('role') ? 'role' : null
const emailCol = userCols.includes('email') ? 'email' : null
const createdCol = userCols.includes('createdAt') ? '"createdAt"' : (userCols.includes('created_at') ? 'created_at' : null)

console.log('\n== Staff User rows (role accounts) ==')
const users = await client.query(
  `SELECT ${pick('email', 'name', 'role', 'isActive', 'store_id', 'storeId', 'block_id', 'blockId', 'campus_id', 'campusId')}
     FROM "User"
    WHERE role IN ('CAMPUS_ADMIN','MALL_ADMIN','BLOCK_MANAGER','STORE_MANAGER','KITCHEN_STAFF','RUNNER')
    ORDER BY ${createdCol ?? 'email'} DESC LIMIT 30`,
)
for (const u of users.rows) {
  console.log('  ' + JSON.stringify(u))
}
console.log(`  (${users.rows.length} staff rows)`)

console.log('\n== Recent Google sign-in audit events ==')
const audits = await client.query(
  `SELECT *
     FROM "AuditLog"
    WHERE action LIKE 'LOGIN_GOOGLE%'
    ORDER BY 1 DESC LIMIT 12`,
)
if (audits.rows.length === 0) console.log('  (none — no Google attempt ever reached the callback user-lookup)')
for (const a of audits.rows) {
  const reason = a.meta?.reason ?? a.meta?.slug ?? ''
  console.log(`  ${new Date(a.createdAt).toISOString()}  ${a.action.padEnd(20)} ${String(a.actorRef ?? '').padEnd(34)} ${reason}`)
}

console.log('\n== Any auth-ish audit events (last 10, any kind) ==')
const any = await client.query(
  `SELECT "createdAt", action, "actorRef" FROM "AuditLog"
    WHERE action ILIKE '%LOGIN%' OR action ILIKE '%AUTH%' OR action ILIKE '%SESSION%'
    ORDER BY "createdAt" DESC LIMIT 10`,
)
for (const a of any.rows) {
  console.log(`  ${new Date(a.createdAt).toISOString()}  ${a.action.padEnd(20)} ${a.actorRef ?? ''}`)
}

await client.end()
