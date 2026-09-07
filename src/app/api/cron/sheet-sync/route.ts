// GET /api/cron/sheet-sync — owner's roster sheet → staff accounts, hands-free.
//
// The owner edits a roster sheet — a Microsoft 365 Excel workbook in OneDrive
// (or SharePoint), a published Google Sheet, or any plain .xlsx/.csv URL —
// with columns like (name, email, role, store, block, zone, phone, password,
// active…). A cron trigger hits this route on a schedule; the server downloads
// the sheet and applies it to the staff User table:
//   new email        → account created (role + scope resolved by name match)
//   changed fields   → account updated (name/role/scope/phone/password/active)
//   active = FALSE   → account deactivated (never deleted — history survives)
//
// The sync core lives in src/lib/sheet-sync-run.ts so it can ALSO be triggered
// automatically (throttled) when someone attempts to log in with credentials
// the server doesn't recognize yet — see src/lib/sheet-autosync.ts.
//
// Auth: requires `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends it
// automatically; external pingers like cron-job.org must set the header).
// `?dry=1` reports what WOULD change without writing anything (safe check).
//
// Security posture: every applied change is audited (STAFF_CREATED / UPDATED /
// DEACTIVATED with actorRef 'sheet-sync'); passwords are validated, hashed and
// never logged, returned, or stored in audit meta; emails are matched exactly
// (lowercase); unknown roles/scopes skip the row with a reason instead of
// guessing; the sheet can never delete a row or escalate past the role list.

import { ok, fail } from '@/lib/api-helpers'
import { cronSecretMatches } from '@/lib/cron-auth'
import { runSheetSync } from '@/lib/sheet-sync-run'

export async function GET(request: Request) {
  if (!cronSecretMatches(process.env.CRON_SECRET, request.headers.get('authorization'))) {
    return fail('Unauthorized', 401)
  }

  const dry = new URL(request.url).searchParams.get('dry') === '1'
  const out = await runSheetSync(dry)
  return out.ok ? ok(out.payload) : fail(out.error, out.status)
}
