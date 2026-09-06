// ROUND 2 — remove demo campus (Nexora), demo runners, demo staff accounts.
// KEEP: Aurora Campus (classrooms/seats/lectures/QR system), asha (owner login), bhagya (mom).
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
const screenCols = (await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='Classroom'`)).rows.map(r => r.column_name)
const screenLink = screenCols.includes('blockId') ? 'blockId' : (screenCols.includes('campusId') ? 'campusId' : null)
console.log('Classroom link column:', screenLink)

// ids in the Nexora subtree
const nexScreens = (await c.query(`SELECT id FROM "Classroom" WHERE "${screenLink}" IN (SELECT id FROM "Block" WHERE "campusId"=$1)`, [NEXORA])).rows.map(r => r.id)
const nexCinemas = (await c.query(`SELECT id FROM "Block" WHERE "campusId"=$1`, [NEXORA])).rows.map(r => r.id)
console.log('nexora blocks:', nexCinemas.length, 'classrooms:', nexScreens.length)

console.log('=== BACKUP ===')
await backup('User', `WHERE email NOT IN ('${KEEP_EMAILS.join("','")}')`)
await backup('Runner')
for (const t of ['Lecture', 'Seat', 'Classroom', 'Block', 'Campus']) await backup(t)
await backup('DeliveryZone')

console.log('=== WIPE NEXORA SUBTREE ===')
await c.query('BEGIN')
try {
  if (nexScreens.length) {
    await del('Lecture', `"classroomId" IN ('${nexScreens.join("','")}')`, '(nexora)')
    await del('Seat', `"classroomId" IN ('${nexScreens.join("','")}')`, '(nexora)')
    await del('Classroom', `id IN ('${nexScreens.join("','")}')`, '(nexora)')
  }
  if (nexCinemas.length) await del('Block', `id IN ('${nexCinemas.join("','")}')`, '(nexora)')
  await del('DeliveryZone', `"campusId" = '${NEXORA}'`, '(nexora)')
  await del('Campus', `id = '${NEXORA}'`, '(nexora)')
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
console.log('campuses:', JSON.stringify((await c.query(`SELECT name FROM "Campus"`)).rows))
console.log('blocks:', (await c.query(`SELECT count(*)::int n FROM "Block"`)).rows[0].n,
  '| classrooms:', (await c.query(`SELECT count(*)::int n FROM "Classroom"`)).rows[0].n,
  '| seats:', (await c.query(`SELECT count(*)::int n FROM "Seat"`)).rows[0].n,
  '| lectures:', (await c.query(`SELECT count(*)::int n FROM "Lecture"`)).rows[0].n)
const staff = (await c.query(`SELECT name, email, role FROM "User"`)).rows
for (const s of staff) console.log(`staff: ${s.name} | ${s.email} | ${s.role}`)
console.log('runners:', (await c.query(`SELECT count(*)::int n FROM "Runner"`)).rows[0].n)
await c.end()
