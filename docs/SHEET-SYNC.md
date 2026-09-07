# Sheet-Sync — manage staff from a Microsoft 365 Excel sheet (or a Google Sheet), fully automatic

Edit a sheet → the server picks it up on its own → staff accounts appear.
No AI, no admin clicks, no code changes. This is the "I type a row and the
server works even while nobody is watching" feature.

**The sheet is the boss of logins**: every staff login makes the server check
the sheet (fresh pull, throttled to one pull per 5 minutes), and a person who
is not in the sheet cannot sign in — even if an account exists in the
database. See "The login gate" below.

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
Name | Email | Role | Campus | Store | Block | Zone | Phone | Password | Active
```

`Campus` (optional) picks the university by exact name for multi-campus
setups — e.g. `Sapthagiri NPS University`. Leave it blank for the default
(first) campus. Store/Block/Zone names only ever match INSIDE the row's own
campus, so two campuses can safely both have a "Campus Canteen".

Example rows:

```
Ravi Kumar      ravi.k@example.com   KITCHEN_STAFF                Wraphouse Kitchen             Snacks@21    TRUE
Priya Sharma    priya@example.com    STORE_MANAGER                Wraphouse Kitchen             Manager@21   TRUE
Test Manager    tm@example.com       STORE_MANAGER   Sapthagiri NPS University  Sapthagiri Canteen           Test@1234    TRUE
Dinesh          dinesh@example.com   RUNNER          Sapthagiri NPS University               Sapthagiri Campus  TRUE
Old Staff       old@example.com      KITCHEN_STAFF                Wraphouse Kitchen                          FALSE
```

Rules:
- **Role** must be one of: `CAMPUS_ADMIN`, `BLOCK_MANAGER`, `STORE_MANAGER`,
  `KITCHEN_STAFF`, `RUNNER` (spelling free — case doesn't matter).
- `STORE_MANAGER` / `KITCHEN_STAFF` need a **Store** name that matches an
  existing shop exactly (e.g. `Wraphouse`).
- `BLOCK_MANAGER` needs a **Block** name; `RUNNER` needs a **Zone** name.
- `Password` (optional): min 8 chars with at least one letter and one number.
  **Leave blank for an existing person you don't want to touch** — a blank
  password never changes their login. Leave blank on create → a random
  password nobody knows; best: just fill it.
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

## 4. When does the sheet get pulled?

**Every staff login attempt pulls the sheet automatically** (throttled to one
pull per 5 minutes per server) — a new row takes effect the moment that
person tries to sign in, and a removed row locks them out on their next
login. No pinger, no cron setup needed.

On top of that, `GET https://notifetch.in/api/cron/sheet-sync` (protected by
`CRON_SECRET`) applies the sheet on a schedule — Vercel's own cron already
hits it once a day as a fallback. External pingers (cron-job.org etc.) are
blocked by the platform's attack protection, so the login-triggered pull is
the real-time mechanism.

To apply a sheet change WITHOUT waiting for a login (e.g. a password reset
for someone who can't log in), just ask the assistant to run the sync once.

## 5. The login gate — no row, no login

The server keeps a snapshot of the last successfully-read sheet. On every
staff login:

1. the server refreshes the snapshot (fresh sheet pull when the 5-minute
   throttle allows; bounded so login never hangs on a slow OneDrive),
2. then checks the email against that snapshot —
   **not in the sheet → login rejected with "ask the owner to add your row"**,
   even if the account exists in the database with the right password.

Fail-safes: until the server has read the sheet successfully ONCE (real
header row + at least one person), the gate stays open — a broken or empty
sheet can never lock everyone out. Removing a row from the sheet blocks new
logins immediately on the next attempt; it never deletes the account, so
order history survives. Every gate rejection is audit-logged
(`LOGIN_BLOCKED_ROSTER`).

## 6. Safe-testing (do this first)

Open in a browser or curl, with the secret header, before letting cron run for
real — it reports what WOULD happen and writes nothing:

```
https://notifetch.in/api/cron/sheet-sync?dry=1
Authorization: Bearer <CRON_SECRET>
```

Response includes `wouldCreate` / `wouldUpdate` / `wouldDeactivate` /
`unchanged` / `skipped` (with reasons per row), plus `rosterGate` — whether
the login gate is armed and how many emails the sheet tracks.

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
