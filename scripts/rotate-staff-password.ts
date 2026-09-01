/**
 * rotate-staff-password.ts — go-live day tool.
 *
 * The pilot's shared staff password (`demo1234`) was public during the demo
 * phase. Before real money flows, rotate it on the PRODUCTION database:
 *
 *   DATABASE_URL="postgresql://...neon..." NEW_PASSWORD="YourNewStrongPass" \
 *     bun scripts/rotate-staff-password.ts
 *
 * - hashes with the exact app format: scrypt$N$r$p$saltHex$hashHex
 *   (N=16384, r=8, p=1, 64-byte key — see src/lib/auth.ts)
 * - updates every pilot staff user
 * - then update ACCESS_CODE in src/app/staff/page.tsx to the same value,
 *   run the gates, and push (the directory shows the code after unlock)
 */
import { randomBytes, scrypt as scryptCb } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>

const N = 16384, R = 8, P = 1, KEY_LEN = 64

const PILOT_EMAILS = [
  'asha@seatserve.demo',
  'vikram@aurora.demo',
  'kitchen@cinema-snacks.demo',
  'kitchen@pizza-corner.demo',
  'kitchen@wrap-house.demo',
  'kitchen@mithai-more.demo',
  'manager@cinema-snacks.demo',
  'ravi@runner.demo',
  'sana@runner.demo',
]

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  const newPassword = process.env.NEW_PASSWORD
  if (!databaseUrl || !databaseUrl.startsWith('postgresql')) {
    console.error('Set DATABASE_URL to the PRODUCTION postgres connection string.')
    process.exit(1)
  }
  if (!newPassword || newPassword.length < 10) {
    console.error('Set NEW_PASSWORD (min 10 chars).')
    process.exit(1)
  }

  const salt = randomBytes(16)
  const hash = await scrypt(newPassword, salt, KEY_LEN, { N, r: R, p: P })
  const stored = `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${hash.toString('hex')}`

  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  try {
    const res = await prisma.user.updateMany({
      where: { email: { in: PILOT_EMAILS } },
      data: { passwordHash: stored },
    })
    console.log(`Rotated password for ${res.count} pilot users.`)
    if (res.count === 0) {
      console.error('WARNING: 0 users matched — check the email list / DB.')
    } else {
      console.log('Next: update ACCESS_CODE in src/app/staff/page.tsx to the same value,')
      console.log('verify a staff login, and delete the old password from any notes.')
    }
  } finally {
    await prisma.$disconnect()
  }
}

void main()
