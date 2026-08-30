# 🍿 SeatServe — in-mall, in-seat food ordering

Multi-store food ordering and delivery inside malls with cinemas. A customer scans the QR
at their cinema seat, orders from multiple participating stores in **one cart**, pays **once**
(mock UPI/card/netbanking in Phase 1), and each store receives **only its own ticket** and
settlement amount. Food is delivered to the exact screen and seat.

> **Status: Phase 2 — platform core.** Customer app stays login-free (seat QR); staff
> consoles are behind a scoped sign-in portal (RBAC: 6 roles, per-store / per-cinema /
> per-mall isolation enforced server-side). Payments remain fully mocked (no real money,
> no real credentials). Merchant onboarding and legal/accounting review come in Phase 4.

---

## Quick start

```bash
bun install                 # install dependencies
bun run db:push             # create/update SQLite schema (Prisma)
bun run db:seed             # seed demo data (mall, cinemas, stores, seats, sample orders)
bun run lint                # eslint
bun test tests/             # domain unit tests (35 tests)
bun test tests/ --coverage  # coverage report
```

The dev server (`bun run dev`, port 3000) is started by the sandbox harness. The realtime
mini-service must be started separately:

```bash
cd mini-services/realtime-service && bun run dev   # socket.io :3003 + internal emit bus :3004
```

## The 60-second demo

Seat QR tokens are **random capabilities** (audit hardening), so the demo entry seat is
resolved dynamically: open `/` and tap *Customer · demo seat*, or read the current tokens
from `GET /api/demo/entry` (sandbox-only helper for scripts/CI).

1. Open **`/?qr=<token from /api/demo/entry>`** (or the landing page → *Customer · demo seat*).
2. Add items from 2–3 stores to one cart → **View cart** → bill breakdown → **Continue to pay**.
3. Mock payment sheet: UPI / Card / Netbanking. There is a **“simulate failure”** switch.
4. After capture you land on **live tracking** — one ticket per store, each with its own status.
5. Open **Kitchen consoles** (left nav on landing page): tickets arrive in realtime with a
   chime; advance `Accept → Preparing → Ready for pickup`.
6. Open the **Runner console**: pick up, deliver. Watch tracking update live.
7. **Admin board**: KPIs (net of refunds), live orders, refund inbox with
   **Approve / Process / Reject** actions, settlement ledger, audit trail.
8. **QR generator**: printable seat-QR sheets; every code opens that exact seat on a phone.
9. **Second mall** (isolation proof): `Nexora Mall · Pune` — its seat shows ONLY Dosa Junction,
   its staff sees zero Aurora orders. Cross-mall ordering is rejected with **409**.

Reset the demo from the **staff portal** (mall admin sign-in → “Reset demo data”) or
`POST /api/simulator/reset` with a mall-admin session (wipes all sessions — you re-login).

## Two portals, one platform (Phase 2)

| | Customer app | Staff portal (`#/staff`) |
|---|---|---|
| Who | Guests who scan a seat QR — **no login** | Cooks, runners, managers, admins — email + password |
| Production shape | `seatserve.in` | `staff.seatserve.in` (separate site, same API) |
| Sees | Their own cart / order only | Only what their **tenant scope** allows |

**Demo credentials** — password for every account: `demo1234`

| Role | Email | Scope |
|---|---|---|
| Mall Admin (Aurora) | `asha@seatserve.demo` | All 4 Aurora stores, all screens, refunds, reset & QR |
| Mall Admin (Nexora) | `meera@nexora.demo` | Second mall — must see ZERO Aurora data (isolation proof) |
| Cinema Manager | `vikram@aurora.demo` | Wing A cinema only (orders, QR for its screens) |
| Store Manager | `manager@cinema-snacks.demo` (+ 1 per store) | Own store only |
| Kitchen Staff | `kitchen@cinema-snacks.demo` (+ 1 per store) | Own store's tickets only |
| Runner | `ravi@runner.demo` / `sana@runner.demo` / `kiran@runner.demo` | Own delivery runs, own mall only |

**How tenant isolation works** — the session user carries `mallId / cinemaId / storeId /
runnerId`; every staff API derives its Prisma filters from the **session**, never from query
params. A cook requesting another store's tickets gets **403** (not a hidden button); a
runner advancing someone else's run gets **403**; the cinema manager's admin board only
contains their cinema's orders. Same code serves N malls × N cinemas × N stores — it's data,
not new code per tenant.

**Cross-mall isolation (audit round)** — with the second seed mall this is now *proven*, not
assumed: `/api/context` returns only the seat's mall's stores; `POST /api/orders` rejects
products from another mall (409); the runner queue is scoped via the runner's zone's mall;
`AuditLog.mallId` makes audit scoping exact; and realtime staff rooms are **mall-scoped AND
token-gated** (`admin:<mallId>`, `runners:<mallId>`, `store:<storeId>` — tokens minted by
`/api/realtime/token` after session checks, verified HMAC-side by the socket hub; order
rooms stay open because the unguessable order code is the capability). Login is rate-limited
(5 failures / 10 min per email+IP, in-memory sandbox limiter).

Security mechanics: scrypt-hashed passwords (per-user salt, timing-safe verify); sessions
are opaque 32-byte tokens in an **httpOnly, SameSite=Lax** cookie — only the SHA-256 hash is
stored server-side (a DB dump can't be replayed); 7-day expiry; logout revokes the row.
Audit log records LOGIN / LOGIN_FAILED and every staff action with the session-derived actor.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:/home/z/my-project/db/custom.db` | SQLite (dev). PostgreSQL in Phase 2+. |
| `PAYMENT_WEBHOOK_SECRET` | `sandbox_webhook_secret_dev_only` | HMAC-SHA256 secret shared with the (mock) gateway. **Set a real secret before exposing webhooks.** |
| `REALTIME_EMIT_URL` | `http://127.0.0.1:3004/emit` | Internal emit bus of the realtime service. |
| `REALTIME_ROOM_SECRET` | `sandbox_room_secret_dev_only` | HMAC secret for staff realtime room tokens (shared by API + socket hub). |
| `INTERNAL_BASE_URL` | `http://localhost:3000` | Used by the mock gateway to call our public webhook endpoint. |

## API surface

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | liveness + DB check |
| GET | `/api/context?qr=` | QR resolution → seat, showtime, cutoff, stores, settings |
| POST | `/api/orders` | multi-store order; server-side cutoff/availability/money math |
| GET | `/api/orders/[code]` | tracking payload (statuses, runner, payment, refunds) |
| POST | `/api/orders/[code]/support` | refund/help request (paid orders only, capped at refundable balance, deduped) |
| POST | `/api/admin/refunds/[id]/action` | finance actioning: APPROVE / REJECT / PROCESS — writes negative ledger rows, updates `refundedPaise` |
| POST | `/api/realtime/token` | staff-only HMAC room tokens for the token-gated socket rooms |
| GET | `/api/demo/entry` | sandbox-only: current demo seat tokens (they are random capabilities) |
| POST | `/api/payments/mock-pay` | **sandbox** gateway; idempotency-key enforced |
| POST | `/api/payments/webhook` | HMAC-verified, dedupe-keyed event processor |
| POST | `/api/auth/login` · GET `/api/auth/me` · POST `/api/auth/logout` | staff session (httpOnly cookie) |
| GET | `/api/kitchen/tickets?storeId=` | staff-only; cook pinned to own store, 403 cross-store |
| POST | `/api/kitchen/tickets/[id]/status` | state machine `NEW→…→DELIVERED`, scoped actor |
| GET | `/api/runner` · POST `/api/runner/assign` · POST `/api/runner/tickets/[id]/status` | runner leg; runners pinned to own runs |
| GET | `/api/admin/overview` | KPIs/live orders/refunds/settlement — scoped mall / cinema / store |
| GET | `/api/admin/qr?screenId=` | seat QR data-URLs — scoped to own cinema/mall |
| PATCH | `/api/stores/[id]` · `/api/products/[id]` | open/close, 86 items — own store only |
| POST | `/api/simulator/reset` | wipe + reseed demo (mall admin only) |
| GET | `/api/audit` | audit trail (mall/cinema scoped) |

## Payments — how the sandbox works

`POST /api/payments/mock-pay` plays the role of a **Razorpay Route / Cashfree Easy Split**
gateway:

1. Creates a `Payment` row (`INITIATED`) keyed by the client's `idempotencyKey`
   (replaying a key returns the original result — a retry can never double-charge).
2. Builds a provider event (`payment.captured` / `payment.failed`), signs it with
   **HMAC-SHA256 over the raw body** using the shared secret.
3. POSTs it to our own **public webhook endpoint** exactly like a real gateway.
4. The webhook verifies the signature (timing-safe), dedupes by `eventId`
   (unique `dedupeKey` — duplicate webhooks are no-ops), then flips payment/order state,
   writes audit logs and broadcasts realtime events.

Only a **masked** display string (`te••@okhdfc`, `•••• 4242`) is ever stored. Card numbers,
UPI PINs and credentials are never accepted by the API.

**Split ledger:** every paid order writes `Split` rows — `STORE` (net of GST component and
commission), `TAX`, `PLATFORM_COMMISSION` (convenience fee + commission), `DELIVERY_FEE` —
whose amounts **always sum to the paid total** (enforced by unit tests). Gateway payout fees
and real settlement runs are Phase 3 (Razorpay/Cashfree sandbox), because fees differ per
provider and method.

## Data model (Prisma, normalized)

`Mall → Cinema → Screen → Seat (unique qrToken)`, `Showtime (cutoff)`, `DeliveryZone`,
`Store (KYC, commission) → Product (paise, GST, prep ETA, veg/allergens)`,
`Cart → CartItem`, `Order → OrderItem (price snapshots) → StoreTicket (per-store status)`,
`Runner → DeliveryRun`, `Payment → PaymentEvent`, `Refund`, `Split`, `Settlement`,
`User (6 roles)`, `AuditLog`, `AppSetting`.

SQLite has no enum types, so status fields are `String` columns constrained by zod +
TypeScript unions in `src/lib/types.ts` (they become real enums on PostgreSQL).

## Testing

- **Unit** (`bun test tests/`): pricing/GST math, split-ledger invariant, cutoff rules,
  ticket/order state machines, webhook signatures, ID formats, **password hashing, session
  token hygiene, RBAC allow-lists, tenant-scope guards** — 49 tests, high coverage of the
  domain + auth layers.
- **API golden path** (`bash scripts/api-golden-path.sh`): **48 end-to-end assertions** over
  the live server — QR resolution, ordering, idempotent payment, state machine guards, runner
  leg, refund dedupe, cutoff lock, forged-webhook rejection, **plus the full auth matrix:
  login/logout, wrong-password 401, anonymous 401s on every staff API, cook-cross-store 403,
  runner self-run pinning, cinema-manager scoping, reset/QR/store-toggle RBAC**.
- **E2E browser tests (Playwright)**: Phase 3 backlog (golden path currently verified via
  scripted browser runs).

## Phased roadmap

- **Phase 1 ✅** — clickable demo, mock payment + signed webhook simulation, realtime staff
  dashboards, QR sheets, seed data, tests.
- **Phase 2 ✅ (this build)** — auth + RBAC with tenant scoping (mall / cinema / store /
  runner), separate staff portal with login, scoped admin board & QR sheets, session
  security (scrypt + hashed opaque tokens), 49 unit tests + 48 API assertions, bug fix:
  QR-entry customers now land on tracking after payment (previously bounced back to menu).
  *Note: PostgreSQL migration was planned here; the sandbox runtime is SQLite-only, so the
  schema stays provider-agnostic and the migration is a documented one-line provider swap
  with `db:push` in Phase 4 deployment. Admin CRUD beyond toggles moved to Phase 3.*
- **Phase 3 ✅** — Razorpay Route / Cashfree Easy Split sandbox: multi-provider signed
  webhooks (verifier-claims-event; hex HMAC for Razorpay, timestamp-bound base64 HMAC for
  Cashfree), env-activated real rails (`/api/payments/session` creates real sandbox orders
  with Route transfers / Easy Split vendor splits; refund PROCESS submits to the gateway
  before writing ledger rows), customer partial cancel with exact auto-refund, full/partial
  refunds, ledger-driven settlement batches (PENDING → PROCESSED + UTR), R1–R5 reconciliation,
  admin settlement & reconciliation panel, anti-scam seat trace.
- **Phase 4 ✅ (demo-grade)** — money model simplified per owner decision (NO delivery fee,
  NO platform-held GST, platform fee FIXED at 5% of the customer total), PostgreSQL
  migration kit (`bun run db:schema:pg` — generated schema variant, validated), merchant KYC
  onboarding (masked submission → mall-admin review → payout gate in the settlement engine),
  security review + hardening (CSP, X-Frame-Options, nosniff; docs/SECURITY-REVIEW.md),
  legal & accounting notes (docs/LEGAL-NOTES.md), deployment kit (Dockerfile,
  .env.example, docs/DEPLOYMENT.md).

## Honest limitations (Phase 4 build)

- **Single route SPA** — the sandbox gateway exposes one port; views are hash-routed
  (`#/seat/…`, `#/staff`, `#/kitchen/…`). In production the staff portal would be a separate
  deployment (e.g. `staff.seatserve.in`) sharing the same API.
- **Mock payments only** — the sandbox never touches real money; it exists to prove the
  state machine, idempotency, signature verification and split math.
- **Realtime** is socket.io + polling fallback; a dead socket degrades gracefully.
- **Demo passwords are public** (`demo1234`) by design — this is a sandbox. Phase 4 adds
  invite flows, password rotation and rate limiting before any real deployment.
- **AuditLog mall scoping** — store/product-level audit events (no orderId) are shown to the
  mall admin without a mall filter (sandbox has one mall); Phase 4 adds a denormalized
  mallId column to AuditLog for exact multi-mall scoping.
