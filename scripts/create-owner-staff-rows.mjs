// THE FIX for "Google sign-in does nothing": the owner's Gmail accounts have
// no staff User rows in prod (audit proved reason=no_account). Create them as
// active CAMPUS_ADMIN accounts so the exact-email link succeeds on the next
// Google attempt. Password hash uses the app's own scrypt format (random
// secret — they sign in with Google; password reset flow exists if ever needed).
// Idempotent: skips emails that already exist. Never prints the passwords.
import { randomBytes, scrypt as scryptCb } from 'node:crypto'
import { promisify } from 'node:util'
import { readFileSync } from 'node:fs'
import pg from 'pg'

const scrypt = promisify(scryptCb)
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 }
const KEY_LEN = 64

async function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, KEY_LEN, SCRYPT_PARAMS)
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString('hex')}$${hash.toString('hex')}`
}

const url = readFileSync('/home/z/my-project/.env.prod-db', 'utf8').match(/DATABASE_URL=(.+)/)[1].trim()
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()

const EMAILS = ['yashask2006@gmail.com', 'clash.2.yashas@gmail.com']
const PHONE = { 'yashask2006@gmail.com': '+919000000001', 'clash.2.yashas@gmail.com': '+919000000002' }
const cuid = () => `c${Date.now().toString(36)}${randomBytes(6).toString('hex')}`

for (const email of EMAILS) {
  const existing = await client.query('SELECT id, email, role, "isActive" FROM "User" WHERE email = $1', [email])
  if (existing.rows.length > 0) {
    console.log(`[skip] ${email} already exists (role ${existing.rows[0].role}, active=${existing.rows[0].isActive})`)
    continue
  }
  const id = cuid()
  const pwdHash = await hashPassword(randomBytes(24).toString('base64url'))
  const ins = await client.query(
    `INSERT INTO "User" (id, name, phone, email, role, "passwordHash", "isActive")
     VALUES ($1, $2, $3, $4, 'CAMPUS_ADMIN', $5, true) RETURNING id, email, role, "isActive"`,
    [id, 'Yashas', PHONE[email], email, pwdHash],
  )
  console.log(`[created] ${ins.rows[0].email} role=${ins.rows[0].role} active=${ins.rows[0].isActive} id=${ins.rows[0].id}`)
  await client.query(
    `INSERT INTO "AuditLog" (id, "actorRole", "actorRef", action, "entityType", "entityId", meta, "createdAt")
     VALUES ($1, 'SYSTEM', 'dev-console', 'STAFF_CREATED', 'User', $2, $3, now())`,
    [cuid(), email, JSON.stringify({ via: 'google-signin-fix', role: 'CAMPUS_ADMIN' })],
  )
}

console.log('\n== verify ==')
const check = await client.query(
  `SELECT email, role, "isActive" FROM "User" WHERE email = ANY($1) ORDER BY email`,
  [EMAILS],
)
for (const r of check.rows) console.log(`  ${r.email.padEnd(32)} ${r.role.padEnd(14)} active=${r.isActive}`)

await client.end()
console.log('\nDone — owner should now retry "Sign in with Google" and pick either account.')
