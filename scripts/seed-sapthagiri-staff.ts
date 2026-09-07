// Seed Sapthagiri NPS University TEST staff into PROD via the REAL sync engine.
// Uses the multi-campus Campus column (committed 47fa8df). Idempotent.
//
//   DATABASE_URL=postgres://... SHEET_SYNC_URL=http://127.0.0.1:8791/sapthagiri.csv \
//     bun scripts/seed-sapthagiri-staff.ts [--dry]
import { runSheetSync } from '../src/lib/sheet-sync-run'

const CAMPUS = 'Sapthagiri NPS University'
const STORE = 'Sapthagiri Canteen'
const ZONE = 'Sapthagiri Campus'
const PWD = 'Test@1234'

const rows = [
  ['Test Manager', 'test.manager@notifetch.in', 'STORE_MANAGER', STORE, '', PWD, CAMPUS],
  ['Test Chef 1', 'test.chef1@notifetch.in', 'KITCHEN_STAFF', STORE, '', PWD, CAMPUS],
  ['Test Chef 2', 'test.chef2@notifetch.in', 'KITCHEN_STAFF', STORE, '', PWD, CAMPUS],
  ['Test Chef 3', 'test.chef3@notifetch.in', 'KITCHEN_STAFF', STORE, '', PWD, CAMPUS],
  ['Test Chef 4', 'test.chef4@notifetch.in', 'KITCHEN_STAFF', STORE, '', PWD, CAMPUS],
  ['Test Runner 1', 'test.runner1@notifetch.in', 'RUNNER', '', ZONE, PWD, CAMPUS],
  ['Test Runner 2', 'test.runner2@notifetch.in', 'RUNNER', '', ZONE, PWD, CAMPUS],
  ['Test Runner 3', 'test.runner3@notifetch.in', 'RUNNER', '', ZONE, PWD, CAMPUS],
  ['Test Runner 4', 'test.runner4@notifetch.in', 'RUNNER', '', ZONE, PWD, CAMPUS],
]

const CSV = ['Name,Email,Role,Store,Zone,Password,Campus']
  .concat(rows.map((r) => r.join(',')))
  .concat([''])
  .join('\n')

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
