# 🍿 SeatServe — in-mall, in-seat food ordering

Multi-store food ordering and delivery inside malls with cinemas. A customer scans the QR
at their cinema seat, orders from multiple participating stores in **one cart**, pays **once**
(mock UPI/card/netbanking in Phase 1), and each store receives **only its own ticket** and
settlement amount. Food is delivered to the exact screen and seat.

> **Status: Phase 1 — clickable sandbox demo.** Payments are fully mocked (no real money,
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

1. Open **`/?qr=A3-F12`** (or the landing page → *Customer · Seat F-12*).
2. Add items from 2–3 stores to one cart → **View cart** → bill breakdown → **Continue to pay**.
3. Mock payment sheet: UPI / Card / Netbanking. There is a **“simulate failure”** switch.
4. After capture you land on **live tracking** — one ticket per store, each with its own status.
5. Open **Kitchen consoles** (left nav on landing page): tickets arrive in realtime with a
   chime; advance `Accept → Preparing → Ready for pickup`.
6. Open the **Runner console**: pick up, deliver. Watch tracking update live.
7. **Admin board**: KPIs, live orders, refund requests, pending settlement ledger, audit trail.
8. **QR generator**: printable seat-QR sheets; every code opens that exact seat on a phone.

Reset everything any time from the landing page (or `POST /api/simulator/reset`).

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:/home/z/my-project/db/custom.db` | SQLite (dev). PostgreSQL in Phase 2+. |
| `PAYMENT_WEBHOOK_SECRET` | `sandbox_webhook_secret_dev_only` | HMAC-SHA256 secret shared with the (mock) gateway. **Set a real secret before exposing webhooks.** |
| `REALTIME_EMIT_URL` | `http://127.0.0.1:3004/emit` | Internal emit bus of the realtime service. |
| `INTERNAL_BASE_URL` | `http://localhost:3000` | Used by the mock gateway to call our public webhook endpoint. |

## API surface (Phase 1)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | liveness + DB check |
| GET | `/api/context?qr=` | QR resolution → seat, showtime, cutoff, stores, settings |
| POST | `/api/orders` | multi-store order; server-side cutoff/availability/money math |
| GET | `/api/orders/[code]` | tracking payload (statuses, runner, payment, refunds) |
| POST | `/api/orders/[code]/support` | refund/help request (deduped per order) |
| POST | `/api/payments/mock-pay` | **sandbox** gateway; idempotency-key enforced |
| POST | `/api/payments/webhook` | HMAC-verified, dedupe-keyed event processor |
| GET | `/api/kitchen/tickets?storeId=` | paid tickets for ONE store only |
| POST | `/api/kitchen/tickets/[id]/status` | state machine `NEW→…→DELIVERED` |
| GET | `/api/runner` · POST `/api/runner/assign` · POST `/api/runner/tickets/[id]/status` | runner leg |
| GET | `/api/admin/overview` | KPIs, live orders, refunds, settlement, audit |
| GET | `/api/admin/qr?screenId=` | seat QR data-URLs (printable) |
| PATCH | `/api/stores/[id]` · `/api/products/[id]` | open/close, 86 items |
| POST | `/api/simulator/reset` | wipe + reseed demo |
| GET | `/api/audit` | audit trail |

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
  ticket/order state machines, webhook signatures, ID formats — **96.6% line coverage** of
  the domain layer.
- **API golden path** (`bash scripts/api-golden-path.sh`): 28 end-to-end assertions over the
  live server — QR resolution, ordering, idempotent payment, state machine guards, runner
  leg, refund dedupe, cutoff lock, forged-webhook rejection.
- **E2E browser tests**: Phase 2 (Playwright).

## Phased roadmap

- **Phase 1 (this build)** — clickable demo, mock payment + signed webhook simulation,
  realtime staff dashboards, QR sheets, seed data, tests.
- **Phase 2** — PostgreSQL, NextAuth RBAC (customer / mall admin / cinema manager / store
  manager / kitchen staff / runner), full admin CRUD, Playwright E2E, rate limiting.
- **Phase 3** — Razorpay Route / Cashfree Easy Split sandbox: real linked accounts, real
  signed webhooks, partial store cancellation, full/partial refunds, settlement &
  reconciliation reports.
- **Phase 4** — production hardening, merchant KYC onboarding, security review, legal &
  accounting review, deployment.

## Honest limitations (Phase 1)

- **No authentication yet** — staff/admin consoles are open demo views (Phase 2 adds
  NextAuth with role-based access). This is intentional for the clickable demo.
- **Single route SPA** — the sandbox gateway exposes one port; views are hash-routed
  (`#/seat/…`, `#/kitchen/…`). Phase 2 moves to real routes.
- **Mock payments only** — the sandbox never touches real money; it exists to prove the
  state machine, idempotency, signature verification and split math.
- **Realtime** is socket.io + polling fallback; a dead socket degrades gracefully.
