// Verification pass — what ACTUALLY happened since the fix? Read-only.
// Shows: Google sign-in successes, new rejections (with exact emails),
// live sessions, and the exact state of the two rows I created.
import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = readFileSync('/home/z/my-project/.env.prod-db', 'utf8').match(/DATABASE_URL=(.+)/)[1]?.trim()
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()

const since = new Date(Date.now() - 12 * 3600_000).toISOString()

console.log('== ALL login-type audit events, last 12h (oldest first) ==')
const audits = await client.query(
  `SELECT "createdAt", action, "entityId", meta FROM "AuditLog"
    WHERE action ILIKE '%LOGIN%' AND "createdAt" >= $1
    ORDER BY "createdAt" ASC`, [since],
)
for (const a of audits.rows) {
  const meta = typeof a.meta === 'string' ? a.meta : JSON.stringify(a.meta)
  console.log(`  ${new Date(a.createdAt).toISOString()}  ${a.action.padEnd(22)} ${String(a.entityId ?? '').padEnd(32)} ${meta ?? ''}`)
}

console.log('\n== Active/any sessions created, last 12h ==')
const sess = await client.query(
  `SELECT s."createdAt", u.email, u.role
     FROM "Session" s JOIN "User" u ON u.id = s."userId"
    WHERE s."createdAt" >= $1 ORDER BY s."createdAt" ASC`, [since],
)
if (sess.rows.length === 0) console.log('  (no sessions created)')
for (const s of sess.rows) {
  console.log(`  ${new Date(s.createdAt).toISOString()}  ${s.email.padEnd(32)} ${s.role}`)
}

console.log('\n== Current state of owner rows ==')
const own = await client.query(
  `SELECT email, name, role, "isActive", "createdAt" FROM "User"
    WHERE email IN ('yashask2006@gmail.com','clash.2.yashas@gmail.com')`,
)
for (const o of own.rows) {
  console.log(`  ${o.email.padEnd(32)} name="${o.name}" role=${o.role} active=${o.isActive} created=${new Date(o.createdAt).toISOString()}`)
}

await client.end()
