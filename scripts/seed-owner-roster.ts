// Seed the owner's two staff rows into PROD via the REAL sync engine.
// Serves the owner's exact roster as CSV on localhost, then calls
// runSheetSync() so every detail matches what the live sheet-sync would do
// (pseudo-phone, scrypt hash, store scope resolution, audit trail).
//
// Usage:
//   DATABASE_URL=postgres://... SHEET_SYNC_URL=http://127.0.0.1:8791/roster.csv \
//     bun scripts/seed-owner-roster.ts [--dry]
import { runSheetSync } from '../src/lib/sheet-sync-run'

const CSV = [
  'Name,Email,Role,Store,Password,Active',
  'Ravi Kumar,ravi@notifetch.in,KITCHEN_STAFF,Wraphouse Kitchen,Passw0rd!23,TRUE',
  'Priya Sharma,priya@notifetch.in,STORE_MANAGER,Wraphouse Kitchen,Passw0rd!45,TRUE',
  '',
].join('\n')

const server = Bun.serve({
  port: 8791,
  fetch: () => new Response(CSV, { headers: { 'content-type': 'text/csv' } }),
})

const dry = process.argv.includes('--dry')
const out = await runSheetSync(dry)
console.log(`mode: ${dry ? 'DRY' : 'REAL WRITE'}`)
console.log(JSON.stringify(out, null, 2))
server.stop(true)
process.exit(out.ok ? 0 : 1)
