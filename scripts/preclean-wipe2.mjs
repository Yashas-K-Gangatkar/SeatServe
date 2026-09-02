// ROUND 2 — remove demo mall (Nexora), demo runners, demo staff accounts.
// KEEP: Aurora Mall (screens/seats/showtimes/QR system), asha (owner login), bhagya (mom).
import pkg from 'pg'
const { Client } = pkg
import { readFileSync, mkdirSync, writeFileSync } from 'fs'

const url = readFileSync('/home/z/my-project/.env.prod-db', 'utf8')
  .split('\n').find(l => l.startsWith('DATABASE_URL=')).split('=')[1]
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

const KEEP_EMAILS = ['asha@seatserve.demo', 'bhagya@gmail.com']
const AURORA = 'cmtgy0cfj0000l8j3ulqzcand'
const NEXORA = 'cmtgy0cul0001l8j352bb2hrg'
const dir = '/home/z/my-project/backups/preclean2-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
mkdirSync(dir, { recursive: true })

const hasCol = async (t, col) =>
  (await c.query(`SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`, [t, col])).rowCount > 0

const backup = async (table, where = '') => {
  const r = await c.query(`SELECT * FROM "${table}" ${where}`)
  writeFileSync(`${dir}/${table}.json`, JSON.stringify(r.rows, null, 1))
  console.log(`backup ${table}: ${r.rowCount}`)
}

const del = async (table, where, label = '') => {
  const r = await c.query(`DELETE FROM "${table}" WHERE ${where}`)
  console.log(`delete ${table} ${label}: ${r.rowCount}`)
}

// discover the id columns we need
const screenCols = (await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='Screen'`)).rows.map(r => r.column_name)
const screenLink = screenCols.includes('cinemaId') ? 'cinemaId' : (screenCols.includes('mallId') ? 'mallId' : null)
console.log('Screen link column:', screenLink)

// ids in the Nexora subtree
const nexScreens = (await c.query(`SELECT id FROM "Screen" WHERE "${screenLink}" IN (SELECT id FROM "Cinema" WHERE "mallId"=$1)`, [NEXORA])).rows.map(r => r.id)
const nexCinemas = (await c.query(`SELECT id FROM "Cinema" WHERE "mallId"=$1`, [NEXORA])).rows.map(r => r.id)
console.log('nexora cinemas:', nexCinemas.length, 'screens:', nexScreens.length)

console.log('=== BACKUP ===')
await backup('User', `WHERE email NOT IN ('${KEEP_EMAILS.join("','")}')`)
await backup('Runner')
for (const t of ['Showtime', 'Seat', 'Screen', 'Cinema', 'Mall']) await backup(t)
await backup('DeliveryZone')

console.log('=== WIPE NEXORA SUBTREE ===')
await c.query('BEGIN')
try {
  if (nexScreens.length) {
    await del('Showtime', `"screenId" IN ('${nexScreens.join("','")}')`, '(nexora)')
    await del('Seat', `"screenId" IN ('${nexScreens.join("','")}')`, '(nexora)')
    await del('Screen', `id IN ('${nexScreens.join("','")}')`, '(nexora)')
  }
  if (nexCinemas.length) await del('Cinema', `id IN ('${nexCinemas.join("','")}')`, '(nexora)')
  await del('DeliveryZone', `"mallId" = '${NEXORA}'`, '(nexora)')
  await del('Mall', `id = '${NEXORA}'`, '(nexora)')
  await del('Runner', 'TRUE', '(all demo runners)')
  await c.query('COMMIT')
  console.log('COMMIT OK')
} catch (e) {
  await c.query('ROLLBACK')
  console.log('ROLLED BACK:', e.message)
  process.exit(1)
}

console.log('=== DEMO STAFF (keep asha + bhagya only) ===')
await c.query('BEGIN')
try {
  await del('User', `email NOT IN ('${KEEP_EMAILS.join("','")}')`, '(demo staff)')
  await c.query('COMMIT')
  console.log('COMMIT OK')
} catch (e) {
  await c.query('ROLLBACK')
  console.log('ROLLED BACK:', e.message)
  process.exit(1)
}

console.log('=== FINAL VERIFY ===')
console.log('malls:', JSON.stringify((await c.query(`SELECT name FROM "Mall"`)).rows))
console.log('cinemas:', (await c.query(`SELECT count(*)::int n FROM "Cinema"`)).rows[0].n,
  '| screens:', (await c.query(`SELECT count(*)::int n FROM "Screen"`)).rows[0].n,
  '| seats:', (await c.query(`SELECT count(*)::int n FROM "Seat"`)).rows[0].n,
  '| showtimes:', (await c.query(`SELECT count(*)::int n FROM "Showtime"`)).rows[0].n)
const staff = (await c.query(`SELECT name, email, role FROM "User"`)).rows
for (const s of staff) console.log(`staff: ${s.name} | ${s.email} | ${s.role}`)
console.log('runners:', (await c.query(`SELECT count(*)::int n FROM "Runner"`)).rows[0].n)
await c.end()
