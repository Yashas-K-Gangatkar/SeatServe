# SeatServe — Security Review (Phase 4)

Reviewer: CTO + Developer roles · Scope: full codebase at Phase 3/4 completion · Status: reviewed for sandbox + production-readiness gap list

## 1. Threat model summary

| Asset | Threat | Control in place |
|---|---|---|
| Money (split ledger) | Double payout | `Split.settlementId` backlinks one ledger row to at most one Settlement batch — double payout is structurally impossible |
| Money | Fake capture (no real money) | Every captured payment requires a signature-valid `payment.captured` event (HMAC-SHA256, timing-safe compare, per-provider secrets); reconciliation R5 flags violations |
| Money | Refund inflation | Refund amounts clamped to `totalPaise − refundedPaise`; gateway refunds submitted BEFORE ledger rows are written |
| Money | Kitchen advancing unpaid orders | Every staff transition requires `paymentStatus === 'PAID'` (cancellation excepted, on purpose) |
| Customer | State tampering from the client | ALL bill amounts computed server-side; client only renders. Cart is re-priced from the DB at placement |
| Tenant | Cross-mall/cinema/store leaks | Session-derived scope on every staff API (`requireStaff` + `canAccessStore`); cross-mall ordering returns 409; second mall seeded to keep this testable |
| Sessions | Session theft | Raw session token never stored (only sha256 hash); 7-day expiry; httpOnly + SameSite=Lax cookie; logout revokes the row |
| Auth | Credential stuffing | scrypt password hashing with per-user salt; login rate limiter (5 fails / 10 min per email+IP → 429) |
| Webhooks | Replay / forged events | `eventId` dedupe (unique key) + signature binding to raw body; Cashfree binds timestamp+body |
| Webhooks | Late failure corrupting PAID state | `payment.failed` after capture is a no-op (`already_paid`) |
| QR | Seat-QR cloning / scam | 432 unique capability tokens (unambiguous 10-char alphabet); every order permanently stamps the seat; admin Seat Trace lookup with audited searches |
| Staff abuse | Untraceable actions | Every money/state action writes an AuditLog row (actor role + ref + mall scope); seat traces are audited too |

## 2. Findings and their status

### Fixed during phases 1–3
1. Multi-provider webhook verification: verifier-claims-event model; signatures bind the raw body. ✅
2. Idempotent payment + webhook dedupe (eventId unique). ✅
3. Late `payment.failed` after capture can no longer corrupt PAID orders. ✅
4. Kitchen/runner optimistic state guards (`updateMany` where status = previous) kill most race double-transitions. ✅
5. Refund ledger exactness: largest-remainder proportional reversal, Σ negative = refund, commission reversal ≤ commission charged. ✅
6. Security headers: CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy. ✅
7. KYC stores only masked compliance values (GSTIN, PAN 2+last, bank last-4). Raw values never persisted. ✅

### Open, ordered by priority (honest gap list)
1. **Rate limiter is in-memory** — a multi-instance deployment needs Redis (or shared store). Single-box fine.
2. **CSP allows `unsafe-inline`/`unsafe-eval`** — required by the sandbox/dev toolchain; tighten to nonce-based CSP on production build.
3. **Session expiry cleanup** — expired sessions are rejected but rows persist until TTL sweep; add a cron to purge.
4. **No CSRF token** — cookie is SameSite=Lax and all mutating routes require JSON bodies, which blocks the classic attack in modern browsers; a synchronizer token is still recommended before public launch.
5. **Playwright E2E suite** — golden-path API suite (102 assertions) + 70 unit tests exist; browser-level E2E automation is the next hardening step.
6. **Per-IP throttle on `/api/orders`** — currently limited by the ordering-cutoff window; add explicit anti-spam throttle before launch.
7. **Gateway checkout (client SDK)** — the session endpoint returns client-safe gateway params; integrating Razorpay Checkout.js / Cashfree JS SDK on the device is a launch task (needs real sandbox keys).

## 3. Verification commands

```
bun test                    # 70 unit tests (money invariants, signatures, auth, cutoff)
bash scripts/api-golden-path.sh   # 102 end-to-end API assertions incl. isolation + money
```
