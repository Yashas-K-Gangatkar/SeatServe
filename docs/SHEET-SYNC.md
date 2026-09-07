# Sheet-Sync — manage staff from a Microsoft 365 Excel sheet (or a Google Sheet), fully automatic

Edit a sheet → the server picks it up on its own → staff accounts appear.
No AI, no admin clicks, no code changes. This is the "I type a row and the
server works even while nobody is watching" feature.

Works with **Microsoft 365** (Excel in OneDrive — personal `1drv.ms` links and
Microsoft 365 Business / SharePoint links), **Google Sheets**, or any plain
`.xlsx` / `.csv` file behind a URL.

## What it does (every sync run)

| Row in your sheet | What the server does |
|---|---|
| New email | Creates the staff account with the given role + scope |
| Changed name / role / store / phone | Updates the account |
| Changed password | Resets that person's password |
| `active` = FALSE | Deactivates the login (never deletes — order history survives) |
| `active` = TRUE again | Re-activates |
| Bad row (unknown role, missing email…) | Skipped safely — reason reported, nothing breaks |

Every change is written to the audit log (`STAFF_CREATED` / `STAFF_UPDATED` /
`STAFF_DEACTIVATED`, actor `sheet-sync`). Emails never need to be real mailboxes
— they are login IDs, exactly like the Team panel.

## 1. Make the sheet

Create a sheet in **Excel (OneDrive)** or **Google Sheets** with this header
row (column order free, capitalization free, extra columns ignored):

```
Name | Email | Role | Store | Block | Zone | Phone | Password | Active
```

Example rows (Aurora Mall):

```
Ravi Kumar      ravi.k@example.com   KITCHEN_STAFF  Wraphouse              Snacks2Go    TRUE
Priya Sharma    priya@example.com    STORE_MANAGER  Wraphouse              Manager@21   TRUE
Suresh          suresh@example.com   BLOCK_MANAGER            Science Block  Block@123  TRUE
Dinesh          dinesh@example.com   RUNNER                    Zone A                  TRUE
Old Staff       old@example.com      KITCHEN_STAFF  Wraphouse                           FALSE
```

Rules:
- **Role** must be one of: `CAMPUS_ADMIN`, `BLOCK_MANAGER`, `STORE_MANAGER`,
  `KITCHEN_STAFF`, `RUNNER` (spelling free — case doesn't matter).
- `STORE_MANAGER` / `KITCHEN_STAFF` need a **Store** name that matches an
  existing shop exactly (e.g. `Wraphouse`).
- `BLOCK_MANAGER` needs a **Block** name; `RUNNER` needs a **Zone** name.
- `Password` (optional): min 8 chars with at least one letter and one number.
  Leave blank on create → a random password nobody knows; the person then logs
  in with Google (if their Gmail was added) or you reset a password from the
  Team panel. Best: just fill it.
- `Phone` (optional): 10–13 digits. If blank, the server generates a dummy.
- `Active` (optional): TRUE/FALSE. Blank = no change on update, TRUE on create.

Excel notes:
- Excel Online **autosaves**; desktop Excel uploads on save — either way the
  server sees the latest version within minutes.
- Type **Phone** without a leading `+` (e.g. `919876543210` or plain
  `9876543210`). Excel treats a leading `+` as a formula.
- Keep the **Email** / **Role** columns as plain text (that is Excel's default
  for these values).

## 2. Get a link the server can read

### Option A — Microsoft 365 (OneDrive / Excel) — recommended

1. Open the workbook in **Excel Online** (or desktop Excel saved to OneDrive).
2. Click **Share** (top-right) → in the link settings pick **“Anyone with the
   link”** and access level **“Can view”** → **Apply**.
3. **Copy link** → that URL (looks like `https://1drv.ms/x/s!…` or
   `https://yourorg-my.sharepoint.com/:x:/g/personal/…`) is the
   `SHEET_SYNC_URL`.

Both OneDrive-personal and Microsoft 365 Business (SharePoint) links work.
The server downloads the workbook through OneDrive's anonymous-download
endpoints and reads the `.xlsx` directly — no exports, no add-ons.

> **Privacy:** anyone who holds the link can **view** the sheet — exactly like
> the Google publish flow. Don't put personal banking/personal passwords in
> it, use work-login passwords only, and remove the share link if you ever
> retire the sheet.

> If a sync ever reports *“got a sign-in / preview page instead of the
> file”*, the link isn't anonymous-viewable — go back to Share → link
> settings → “Anyone with the link”.

### Option B — Google Sheets

In the sheet: **File → Share → Publish to web →** pick the sheet tab →
format **Comma-separated values (.csv)** → **Publish** → copy the long URL.
(A normal “Anyone with the link” Google share URL also works — the server
converts it to a CSV export automatically.)

Keep the link private — anyone with the link can read the sheet (that's how
the server reads it). Don't reuse personal passwords there; these are work
logins for a canteen system.

## 3. Activate it (2 minutes)

Paste the sheet link (OneDrive/SharePoint or Google CSV — either works) to
the assistant (it will set `SHEET_SYNC_URL` on Vercel and run a `?dry=1`
check with you), **or** set it yourself:

Vercel Dashboard → project `ct_shop` → Settings → Environment Variables →
add `SHEET_SYNC_URL` = the sheet link (all environments) → Deployments →
Redeploy.

## 4. Make it run every 5 minutes

The sync endpoint is `GET https://notifetch.in/api/cron/sheet-sync` and it is
protected by `CRON_SECRET` (already configured on Vercel — Vercel's own cron
sends it automatically once per day as a fallback).

For ~5-minute freshness, use a free pinger (cron-job.org, 3-minute setup):
1. Sign up at cron-job.org → **Create cronjob**
2. URL: `https://notifetch.in/api/cron/sheet-sync`
3. Schedule: every 5 minutes
4. Advanced → Headers → add: `Authorization` = `Bearer <your CRON_SECRET>`
   (find it in Vercel → Settings → Environment Variables → CRON_SECRET → click to reveal)
5. Save & enable. Done — the sheet is now the control panel.

(Alternative: GitHub Actions on the repo with a `schedule: '*/5 * * * *'`
workflow that curls the endpoint with the `CRON_SECRET` stored as an Actions
secret — ask the assistant to generate the workflow file.)

## 5. Safe-testing (do this first)

Open in a browser or curl, with the secret header, before letting cron run for
real — it reports what WOULD happen and writes nothing:

```
https://notifetch.in/api/cron/sheet-sync?dry=1
Authorization: Bearer <CRON_SECRET>
```

Response includes `wouldCreate` / `wouldUpdate` / `wouldDeactivate` /
`unchanged` / `skipped` (with reasons per row).

## Guarantees

- The sheet can **never delete** a user or create roles outside the five
  staff roles.
- Unmatched store/block/zone → row skipped with a clear reason, not guessed.
- One bad row never blocks the other rows.
- Passwords are hashed on arrival and never appear in logs, responses, or the
  audit trail.
- The endpoint is dead (401) without the secret, and dormant unless
  `SHEET_SYNC_URL` is set.
- The sheet can never delete a row, never create roles outside the five staff
  roles, and a broken/un-shared link just produces an error report — never a
  partial or wrong write.
