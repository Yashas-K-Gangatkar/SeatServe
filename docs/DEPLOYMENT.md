# SeatServe — Deployment Guide (Phase 4)

## 1. Database — SQLite → PostgreSQL

The schema is dialect-agnostic (String "enums" constrained by zod/TS work on both).

```bash
# 1) generate the postgres schema variant (kept in sync from schema.prisma)
node scripts/make-postgres-schema.mjs

# 2) point at your postgres instance and push
DATABASE_URL="postgresql://user:password@host:5432/seatserve" \
  bunx prisma db push --schema prisma/schema.postgres.prisma

# 3) generate the client against postgres for the build machine
DATABASE_URL="postgresql://…/seatserve" \
  bunx prisma generate --schema prisma/schema.postgres.prisma

# 4) seed (the seed script is dialect-agnostic)
DATABASE_URL="postgresql://…/seatserve" bun prisma/seed.ts
```

Status: the postgres schema variant VALIDATES (verified with `prisma validate`);
the sandbox has no Postgres server installed, so the push step must run on your
host. No code changes are needed beyond DATABASE_URL.

## 2. Payments — enabling real sandbox rails

1. Create Razorpay/Cashfree test accounts; take TEST keys.
2. Fill `.env` from `.env.example` (key id/secret + webhook secret; set `PAYMENT_PROVIDER`).
3. Configure the webhook URL in the provider dashboard: `https://your-host/api/payments/webhook` with the events `payment.captured` + `payment.failed`.
4. Per-store split destinations: set `RAZORPAY_ACCOUNT_<SLUG>` (linked account) / `CASHFREE_VENDOR_<SLUG>` (vendor id) after completing the provider's merchant onboarding for each store.
5. What activates automatically:
   - `POST /api/payments/session` → creates a REAL gateway order with per-store Route transfers / Easy Split vendor splits (instructions derived from the order's split ledger).
   - `POST /api/payments/webhook` → the provider's signature scheme claims its events (hex HMAC for Razorpay, timestamp-bound base64 HMAC for Cashfree).

With no keys set, everything runs the SANDBOX_MOCK gateway (mock-pay + local signed webhook) — the demo default.

## 3. Build & run

```bash
bun install
bun run build          # next build (standalone output) + static/public copy
bun run start          # runs .next/standalone/server.js on :3000
```

Docker: `docker build -t seatserve . && docker run -p 3000:3000 --env-file .env seatserve`
(the image runs `prisma db push` on boot — use migrations for real environments).

Realtime service: run `bun mini-services/realtime-service/index.ts` (ports 3003/3004) alongside the app.

## 4. Post-deploy checklist

- [ ] Change all demo passwords (`demo1234`) — seed users are dev-only
- [ ] Set strong per-provider webhook secrets
- [ ] Point the customer app at printed QRs (QrAdmin generates print sheets)
- [ ] Enable the CSP tightening noted in docs/SECURITY-REVIEW.md
- [ ] Configure DB backups + audit-log export
- [ ] Sign off docs/LEGAL-NOTES.md checklist with counsel/CA
