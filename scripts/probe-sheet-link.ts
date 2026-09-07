// Probe a roster sheet link through the production pipeline.
// Usage: bun scripts/probe-sheet-link.ts "<share-url>"
// Prints what the server sees (passwords masked) and what a sync WOULD do.
import { fetchSheet } from '../src/lib/sheet-fetch'
import { readXlsxGrid } from '../src/lib/xlsx-read'
import { mapGrid, mapSheet } from '../src/lib/sheet-sync'

const url = process.argv[2]
if (!url) {
  console.error('usage: bun scripts/probe-sheet-link.ts "<share-url>"')
  process.exit(1)
}

const res = await fetchSheet(url)
if (!res.ok) {
  console.log('FETCH FAILED —', res.error)
  console.log('candidates tried:')
  for (const t of res.tried) console.log('  -', t)
  process.exit(1)
}

console.log(`downloaded: kind=${res.kind} via=${res.via}`)

let parse
if (res.kind === 'xlsx') {
  console.log(`xlsx bytes: ${res.bytes.length}`)
  const grid = readXlsxGrid(res.bytes)
  console.log(`worksheet grid: ${grid.length} rows`)
  for (const row of grid.slice(0, 15)) {
    console.log('  ', JSON.stringify(row.map((c, i) => (grid[0]?.[i] ?? '').toLowerCase().includes('password') && c ? '***' : c)))
  }
  parse = mapGrid(grid)
} else {
  parse = mapSheet(res.text)
}

console.log(`\nheader recognized: ${parse.headerFound}`)
console.log(`total data rows: ${parse.total}`)
for (const r of parse.rows.slice(0, 20)) {
  if (r.ok) {
    const { rowNumber, email, name, role, store, block, zone, phone, active } = r.record
    const pwd = r.record.password ? '(password set)' : '(no password column value)'
    console.log(`  OK   row ${rowNumber}: ${email} | ${name} | ${role} | store=${store ?? '-'} block=${block ?? '-'} zone=${zone ?? '-'} | phone=${phone ?? '-'} | active=${active} | ${pwd}`)
  } else {
    console.log(`  SKIP row ${r.rowNumber}: ${r.email ?? '(no email)'} — ${r.reason}`)
  }
}
