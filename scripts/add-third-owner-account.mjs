// Register clash.3.yashas@gmail.com (owner's 3rd Google account, rejected at
// 20:19:32 with no_account) as active staff. Same rule as the other two.
import { randomBytes, scrypt as scryptCb } from 'node:crypto'
import { promisify } from 'node:util'
import { readFileSync } from 'node:fs'
import pg from 'pg'

const scrypt = promisify(scryptCb)
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 }
const KEY_LEN = 64
const hashPassword = async (password) => {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, KEY_LEN, SCRYPT_PARAMS)
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString('hex')}$${hash.toString('hex')}`
}

const url = readFileSync('/home/z/my-project/.env.prod-db', 'utf8').match(/DATABASE_URL=(.+)/)[1].trim()
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()

const EMAIL = 'clash.3.yashas@gmail.com'
const cuid = () => `c${Date.now().toString(36)}${randomBytes(6).toString('hex')}`

const existing = await client.query('SELECT id, role, "isActive" FROM "User" WHERE email = $1', [EMAIL])
if (existing.rows.length > 0) {
  console.log(`[skip] ${EMAIL} already exists`)
} else {
  const ins = await client.query(
    `INSERT INTO "User" (id, name, phone, email, role, "passwordHash", "isActive")
     VALUES ($1, $2, $3, $4, 'CAMPUS_ADMIN', $5, true) RETURNING id, email, role, "isActive"`,
    [cuid(), 'Yashas', '+919000000003', EMAIL, await hashPassword(randomBytes(24).toString('base64url'))],
  )
  console.log(`[created] ${ins.rows[0].email} role=${ins.rows[0].role} active=${ins.rows[0].isActive}`)
  await client.query(
    `INSERT INTO "AuditLog" (id, "actorRole", "actorRef", action, "entityType", "entityId", meta, "createdAt")
     VALUES ($1, 'SYSTEM', 'dev-console', 'STAFF_CREATED', 'User', $2, $3, now())`,
    [cuid(), EMAIL, JSON.stringify({ via: 'google-signin-fix', role: 'CAMPUS_ADMIN' })],
  )
}

// final verify — all owner accounts
const check = await client.query(
  `SELECT email, name, role, "isActive" FROM "User"
    WHERE email LIKE '%yashas@gmail.com' ORDER BY email`,
)
console.log('\n== All owner-linked staff rows ==')
for (const r of check.rows) console.log(`  ${r.email.padEnd(32)} name="${r.name}" ${r.role} active=${r.isActive}`)
await client.end()
