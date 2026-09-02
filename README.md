# SeatServe (NotiFetch) — in-mall, in-seat food ordering

Multi-store food ordering and delivery inside malls with cinemas. A customer scans the QR
at their cinema seat, orders from multiple participating stores in **one cart**, pays **once**
on a real payment gateway, and each store receives **only its own ticket** and settlement
amount. Food is delivered to the exact screen and seat.

> **Status: LIVE in production** at `notifetch.in` — Next.js on Vercel, PostgreSQL (Neon),
> **real Razorpay payments** (live keys; real rupees have been captured, split and settled
> end-to-end). Customer app stays login-free (seat QR); staff consoles sit behind a scoped
> sign-in portal (RBAC: 6 roles, per-store / per-cinema / per-mall isolation enforced
> server-side). Local sandbox still runs on SQLite + a signed mock gateway for tests.

---

## The flow (all real in production)

```
customer scans seat QR → menu (seat's mall only) → one cart across stores
  → pays once (Razorpay: UPI/card/netbanking) → webhook capture (HMAC-verified)
  → per-store kitchen tickets (realtime) → ACCEPT → PREPARING → READY
  → runner claims / is assigned → PICKED UP → DELIVERED → order COMPLETED
  → nightly settlement batch pays each store (KYC gate) → UTR recorded
```

## Money model (owner decision — simplified and tested)

- Platform fee **fixed at 5% of the customer total**. No delivery fee; prices are
  GST-inclusive and stores remit their own GST.
- Customer total = `round(subtotal / 0.95)` — the fee is grossed up so the store nets
  exactly its subtotal and the platform keeps exactly 5% (enforced by unit tests).
- Every paid order writes `Split` rows (STORE / TAX / PLATFORM_COMMISSION) that **sum to
  the paid total**.
- **Settlement engine** (`src/lib/settlement.ts`): batches `PENDING` STORE rows per mall;
  payouts are **blocked until the mall admin KYC-VERIFIES the store**; each batched row is
  back-linked by `settlementId` — **double payout is structurally impossible**. Nightly
  cron + on-demand "run batch" in the admin panel; processing records the UTR
  (`Mark transferred` flow) and today remains the single human step until RazorpayX
  auto-payout is wired (owner action: activate RazorpayX + store UPI IDs in KYC).

## Roles — who can do what

| Role | Scope | Can do |
|---|---|---|
| MALL_ADMIN | one mall | Staff CRUD, store create + KYC verify, settlement process, full overview/audit/reconciliation, QR sheets, kitchen + runner legs |
| CINEMA_MANAGER | one cinema | QR sheets, seat trace, scoped overview/audit |
| STORE_MANAGER | own store | Menu + price editing, open/close, KYC submission, kitchen tickets, settlement view |
| KITCHEN_STAFF | own store | Ticket queue, `NEW → READY` transitions only |
| RUNNER | own zone/mall | Claim runs (`/api/runner/assign`), `PICKED_UP → DELIVERED` on **own runs only** |
| CUSTOMER | no login | Seat-QR context, order placement, cancel before accept, tracking |

How tenant isolation works: the session user carries `mallId / cinemaId / storeId /
runnerId`; every staff API derives its Prisma filters from the **session**, never from
query params. A cook requesting another store's tickets gets **403** (not a hidden
button); a runner advancing someone else's run gets **403**. Same code serves
N malls × N cinemas × N stores — it's data, not new code per tenant. Cross-mall ordering
is rejected (409); realtime staff rooms are mall-scoped AND token-gated (HMAC tokens from
`/api/realtime/token`).

## Quality gates & CI/CD

- **GitHub Actions (`.github/workflows/ci.yml`)** runs on every push to main:
  `bun install` → Prisma generate → **tsc** → **eslint** → **73 bun tests** → **next build**
  (type errors block the build — `ignoreBuildErrors` is off). Red check = do not deploy.
- Tests cover pricing/GST math, split-ledger invariants, cutoff rules, ticket/order state
  machines, webhook signatures, password hashing, session hygiene, RBAC allow-lists,
  tenant-scope guards.

## Security posture

- **Webhooks**: Razorpay hex HMAC-SHA256 (timing-safe compare) / Cashfree base64 HMAC over
  `timestamp+body` with a **10-minute replay window**; idempotent processing via unique
  `PaymentEvent.dedupeKey`; captured-after-failed and already-paid guards protect money
  state. Late events are recovered by reconciliation (`src/lib/reconcile.ts`), not by
  trusting stale webhooks.
- **Auth**: scrypt-hashed passwords (per-user salt, timing-safe verify); sessions are
  opaque 32-byte tokens in an httpOnly/SameSite=Lax cookie — only the SHA-256 hash is
  stored server-side; 7-day expiry; login lockout (5 fails / 10 min per email+IP).
- **Headers**: HSTS (1 year, subdomains), CSP (Razorpay-aware), X-Frame-Options DENY,
  nosniff, strict Referrer-Policy.
- **KYC masking**: the platform never stores raw bank/PAN credentials — masked snapshots
  only; FSSAI license number is shown to customers **only for KYC-VERIFIED stores**.
- **Audit trail**: every money/state-relevant action logged with actor + timestamp,
  denormalized `mallId` for exact scoping.

## Deployment & operations

- **Host**: Vercel (framework-aware; `vercel.json` pins the build:
  `make-postgres-schema.mjs` → `prisma generate` (postgres schema) → `next build`).
  Push to `main` = deploy after CI passes.
- **Database**: PostgreSQL (Neon) in production; SQLite in local sandbox — the schema is
  generated from one source (`prisma/schema.prisma`) so prod can never drift.
- **Crons** (`vercel.json`, Bearer `CRON_SECRET`, fail-closed when unset):
  - `/api/health?cron=1` daily 04:00 UTC — DB ping + **purge expired sessions**
  - `/api/admin/settlement/auto-daily` nightly — settlement batch (currently a test
    schedule of 23:25 IST, to be pinned to 23:00 IST)
- **Ops scripts** (`scripts/`): `backup-db.mjs` (full read-only export →
  `backups/backup-<ts>/*.json`), KYC/money-audit/cleanup utilities from the family-loop
  testing nights.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite (`file:`) locally, PostgreSQL (Neon) in prod |
| `PAYMENT_PROVIDER` | `SANDBOX_MOCK` \| `razorpay` \| `cashfree` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Live keys; `rzp_live_` prefix activates real rails |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook HMAC shared secret (set in Razorpay dashboard + Vercel) |
| `CRON_SECRET` | Bearer secret for Vercel Cron endpoints (unset = endpoints disabled) |
| `REALTIME_EMIT_URL` / `REALTIME_ROOM_SECRET` | Realtime mini-service emit bus + room-token HMAC |
| `CASHFREE_*` | Optional second provider (App ID, secret key, API version, env, webhook secret) |

Values are NEVER committed (see `.env.example`).

## Data model (Prisma, normalized)

`Mall → Cinema → Screen → Seat (unique qrToken)`, `Showtime (cutoff)`, `DeliveryZone`,
`Store (KYC, commission) → Product (paise, GST, prep ETA, veg/allergens)`,
`Cart → CartItem`, `Order → OrderItem (price snapshots) → StoreTicket (per-store status)`,
`Runner → DeliveryRun`, `Payment → PaymentEvent`, `Split`, `Settlement`,
`User (6 roles)`, `Session`, `AuditLog`, `AppSetting`.

## Local development

```bash
bun install                 # install dependencies
bun run db:push             # create/update SQLite schema (Prisma)
bun run db:seed             # seed demo data (malls, cinemas, stores, seats, orders)
bun run lint                # eslint
bun test                    # full test suite (73 tests)
bun run build               # production build (same as CI)
```

The dev server (`bun run dev`, port 3000) is started by the sandbox harness. The realtime
mini-service runs separately:

```bash
cd mini-services/realtime-service && bun run dev   # socket.io :3003 + internal emit bus :3004
```

Seat QR tokens are random capabilities (audit hardening); in the sandbox, read the current
entry seat from `GET /api/demo/entry` or tap *Customer · demo seat* on the landing page.

## Legal

`/legal/terms`, `/legal/privacy`, `/legal/refund` are live and listed in the sitemap —
covering DPDP Act 2023 privacy rights, RBI failed-transaction reversal timelines, and the
Consumer Protection (E-Commerce) Rules 2020 grievance-officer requirements. The grievance
officer's concrete name/phone are published once the operating entity is incorporated.

## Roadmap (next)

1. **RazorpayX auto-payout** — wire the payout API into the nightly settlement so stores
   are paid to their UPI IDs with zero human steps (owner: activate RazorpayX, add store
   UPI IDs in KYC).
2. **Durable rate limiting** — Redis/Upstash-backed (current in-memory limiter is
   per-serverless-instance).
3. **Error tracking + uptime alerting** (e.g. Sentry) so the nightly health cron alerts on
   failure.
4. **Scheduled off-site backups** — Neon PITR or CI-scheduled `backup-db.mjs` runs.
5. Pre-scale hardening: 2FA for mall admins, GST tax invoices, SMS notifications,
   Playwright E2E suite.
