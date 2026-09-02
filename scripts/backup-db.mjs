// Full read-only production DB backup → backups/backup-<timestamp>/*.json
//
// Usage (needs prod DATABASE_URL — owner can paste the Vercel env value into
// .env.prod-db as `DATABASE_URL=postgres://...`, or export it inline):
//   node scripts/backup-db.mjs
//
// Exports EVERY table in the public schema to one JSON file per table, plus a
// _manifest.json with row counts. Never writes to the database.
import pkg from 'pg'
const { Client } = pkg
import { readFileSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const loadUrl = () => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const f = readFileSync('/home/z/my-project/.env.prod-db', 'utf8')
  const line = f.split('\n').find((l) => l.startsWith('DATABASE_URL='))
  if (!line) throw new Error('DATABASE_URL not found (env or .env.prod-db)')
  return line.split('=')[1].trim()
}

const c = new Client({ connectionString: loadUrl(), ssl: { rejectUnauthorized: false } })
await c.connect()

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const outDir = join('/home/z/my-project/backups', `backup-${stamp}`)
mkdirSync(outDir, { recursive: true })

const tables = (
  await c.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`
  )
).rows.map((r) => r.table_name)

const manifest = { stamp, url: '***redacted***', tables: {} }
for (const t of tables) {
  const res = await c.query(`SELECT * FROM "${t}"`)
  writeFileSync(join(outDir, `${t}.json`), JSON.stringify(res.rows, null, 1))
  manifest.tables[t] = res.rows.length
  console.log(`${t}: ${res.rows.length} rows`)
}

writeFileSync(join(outDir, '_manifest.json'), JSON.stringify(manifest, null, 2))
console.log(`\nbackup complete → ${outDir}`)
await c.end()
