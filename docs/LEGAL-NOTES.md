# SeatServe — Legal & Accounting Notes (Phase 4)

Reviewer: Lawyer role · Status: demo-grade compliance design; obtain chartered-accountant + counsel sign-off BEFORE real money.

## 1. Money flow model (what the platform holds)

- The customer pays ONE amount to the platform's gateway account.
- The split ledger records, per order: STORE net rows (food minus platform commission), and one PLATFORM_COMMISSION row.
- **No delivery fee** — stores are located next door to the screens; the platform charges no delivery line.
- **No platform-held GST** — menu prices are GST-inclusive and the STORE remits its own GST. The platform does not extract, hold, or report GST on behalf of stores. Store net is payable in full.
- Platform fee is fixed at 5% of the customer's final total (gross-up: total = round(subtotal / 0.95)).
- Platform's own GST on its 5% fee (and any TCS/TDS obligations under GST law for e-commerce operators) is OUT OF SCOPE of this demo — flagged for the CA.

## 2. Marketplace / aggregation classification (India)

SeatServe is structured like a marketplace/aggregator: the platform facilitates and collects, stores fulfill. Two consequence areas to get counsel sign-off on:

1. **Razorpay Route / Cashfree Easy Split** both support settlement to merchant linked accounts/vendors — the platform should act as the aggregator of record with signed merchant agreements per store (KYC collected here).
2. **GST on platform fee** — the 5% fee is the platform's service revenue; the platform must issue invoices for it and account for its own GST. The ledger keeps `commissionPaise` per store leg precisely so these invoices are derivable per store, per settlement period.

## 3. KYC / merchant onboarding (implemented)

- Store submits: GSTIN (validated format), PAN, bank account last-4, FSSAI license (14 digits) — food business requirement.
- Stored data is MASKED (PAN → 2 chars + dots + last char; bank → last 4). Raw credentials are never persisted by the platform. This is deliberately conservative: full KYC verification should happen inside the gateway's onboarding (Razorpay Route linked-account KYC / Cashfree vendor onboarding), where the data is encrypted and regulated.
- Mall admin VERIFIES/REJECTS; only VERIFIED stores are payout-eligible (settlement engine gate). All decisions audited.

## 4. Consumer-side obligations

- Cancellation: no customer self-service cancellation of paid orders. The kitchen may stop an unprepared leg (NEW/ACCEPTED/PREPARING); exceptions are resolved in person at the counter.
- Refunds: NONE online — cinema policy. The split ledger only carries VOIDED rows for store legs cancelled before fulfilment (settlement fairness). Counter staff resolve customer exceptions in person.
- Displayed prices include store GST; the platform fee is shown as a separate line BEFORE payment ("Platform fee (5% of total)").

## 5. Data protection notes

- Personal data collected: optional customer name/phone. Order codes are capabilities — anyone with the code can view tracking (documented; codes use an unambiguous 20-character-ish alphabet and are not sequential).
- Payment secrets: never accepted by any API — masked display strings only.
- Audit trail: retained in-app; production should export to append-only storage with retention policy.

## 6. Before real money (checklist for counsel/CA)

- [ ] Merchant agreement template per store (commission %, settlement cycle, cancellation policy)
- [ ] Platform fee invoicing + platform GST registration check
- [ ] TCS under GST (e-commerce operator) applicability review
- [ ] FSSAI display requirement on consumer-facing menu (store-level)
- [ ] Payment-aggregator terms review (Razorpay Route / Cashfree Easy Split marketplace terms)
- [ ] Consumer-protection (e-commerce) disclosures: grievance officer, counter-resolution policy display
