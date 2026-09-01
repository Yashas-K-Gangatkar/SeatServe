# SeatServe — India Legal & Compliance Checklist

Status: pre-launch advisory · Last updated: 2026-08-31 · Companion to `docs/LEGAL-NOTES.md`

> ⚠️ **This is not legal advice.** It is a practical map of what an Indian multi-venue
> food-ordering platform must have in place, compiled so the founder can brief a CA/CS/lawyer
> efficiently. Final structuring (especially GST on restaurant service and money-flow) must be
> signed off by a practising professional.

---

## 1. What SeatServe legally is (and is not)

SeatServe is a **marketplace / technology facilitator**: it connects cinema-goers with
in-venue food outlets, aggregates the cart, and splits the payment. Delivery to the seat is
performed by the **store's own runners**, not by SeatServe staff. Getting this
characterisation right drives almost every obligation below.

| SeatServe IS | SeatServe is NOT |
|---|---|
| Online marketplace (intermediary under IT Act) | A restaurant / food business operator itself |
| An "electronic commerce operator" (ECO) under GST & Consumer Protection Act | A transporter/courier of food |
| Merchant of record for the **platform fee only** (via Razorpay Route) | A payment aggregator — Razorpay holds and settles all funds |
| Data processor/controller for account + order data | An employer of delivery runners (they work for stores) |

**Consequence:** your core duties are (a) tax on your commission, (b) e-commerce disclosure
rules, (c) intermediary/IT rules, (d) data protection. **Food-safety responsibility stays with
each store** — but only if your contracts and product pages say so explicitly.

---

## 2. Registrations — do them in this order

| # | Registration | Why | Approx. cost | Timing |
|---|---|---|---|---|
| 1 | **Business entity** — Pvt Ltd (recommended) or OPC if solo | Razorpay Route KYC, merchant agreements, liability shield, credibility with cinemas | ₹7,000–15,000 (Pvt Ltd), ₹5,000–9,000 (OPC) via ClearTax/Vakilsearch/IndiaFilings | Now, before first real rupee |
| 2 | **PAN + TAN + current account** | Issued with incorporation; needed for gateway payouts to you | Bundled with #1 | With #1 |
| 3 | **GSTIN** | Your commission is a taxable service @ **18% GST**; stores will demand input invoices; ECO rules (see §3) | Govt: free; CA: ₹1,500–3,000 | Before first commission invoice |
| 4 | **FSSAI (stores, not you)** | Every food store needs its own registration/licence (₹100–2,000/yr, state-level). Platform must **display each store's FSSAI number** (FSSAI E-commerce Guidelines 2019). SeatServe needs its own FSSAI registration **only if it ever handles food** — don't. | ₹0 for platform | At store onboarding |
| 5 | **Shop & Establishment** | For your own office/employees | ₹1,000–5,000 | When you hire staff |
| 6 | **Trademark "SeatServe"** | Search free on ipindia.gov.in (classes 9, 35, 39, 43); file before you spend on branding | ₹4,500/class (startup rate) | Early — cheap insurance |

**Entity recommendation:** Private Limited with 2 directors (or One Person Company if you are
solo). A proprietorship works for a tiny pilot but looks weak to cinemas, and personal
liability is unlimited — the exact thing you want to avoid.

---

## 3. GST — the one section to discuss with your CA in depth

1. **Commission income (your platform fee):** taxable at **18% GST**. You must raise monthly
   GST invoices to each store and file GSTR-1/3B. This is flagged in `docs/LEGAL-NOTES.md` and
   the 5% fee is already computed paise-exact per order in the split ledger.
2. **ECO liability on restaurant service (§9(5) CGST Act / Notification 17/2017):** since the
   Supreme Court's Oct-2023 ruling (Zomato case), an electronic commerce operator supplying
   **restaurant services** through its platform may be liable to pay the **5% no-ITC GST** on
   those food orders, instead of the restaurant. Whether SeatServe falls in this net depends on
   facts (who delivers, who is merchant of record for the food value). **This is the single
   most important GST question for your CA** — getting it wrong is the classic food-tech trap.
3. **TCS as ECO (§52, GSTR-8):** ECOs may need to collect 1% TCS on net taxable supplies
   through the platform — applicability depends on the 9(5) answer above. CA decides; budget a
   monthly GSTR-8 filing if applicable.
4. **TDS by stores on your commission (§194H, 2%):** stores paying you commission may deduct
   TDS — your merchant agreement should state who bears what, and you should track Form 26AS.

---

## 4. Money-flow rules (the "don't go to jail" section)

- **Never pool customer money in your own bank account.** Collecting payments into a personal
  account and manually paying stores without a gateway structure is the fastest route to
  payment-aggregator licensing violations and FEMA/Cyber-cell trouble.
- **Use Razorpay Route linked accounts (already the design):** every store gets a linked
  account; the split (95% store / 5% platform) is executed by Razorpay at capture time; funds
  settle RBI-compliantly. You touch only your commission.
- **Create each store's linked account in YOUR Razorpay dashboard** (Route → Linked Accounts)
  and have the store complete KYC there — PAN, bank details, business proof. You drive the
  paperwork; Razorpay holds the money; you never do.
- **Reconcile monthly** using the `PaymentEvent`/`Split` audit tables already in the app, and
  keep every Razorpay webhook event archived.
- **No cash anywhere in the flow.** The app is cashless by design — keep it that way.

---

## 5. Consumer Protection (E-Commerce) Rules 2020 — site must-haves

The rules apply to every marketplace. Concretely, your site/app must show:

- **Per store:** legal name, address, contact, GSTIN, **FSSAI number** (the app's Store model
  has KYC fields — surface them on the store profile).
- **Per product:** MRP and final price inclusive of all taxes (already true — GST-inclusive
  pricing is built into `pricing.ts`), veg/non-veg mark, allergens (already modelled).
- **Grievance Officer:** name, email, phone; complaints acknowledged within **48 hours**,
  resolved within **1 month**. This officer must be named on the site.
- **Policies:** Terms of Use, Privacy Policy, Refund/Cancellation/Delivery policy
  (refund-on-cancel is already implemented in code — document it).
- **No dark patterns:** no fake urgency, no cancellation traps, no forced subscriptions.

> Give me the entity name, registered address, and grievance-officer details once incorporated,
> and I will ship the four legal pages on the site the same day.

---

## 6. Data protection — DPDP Act 2023

- Publish a plain-language privacy policy: what you collect (phone number, seat, order
  history), why, how long you keep it, who you share it with (stores get only what they need
  to fulfil the order — the RBAC scoping already enforces this).
- Consent notice on the QR entry screen before account creation; withdrawal mechanism.
- **Children:** cinemas are full of minors. DPDP bans tracking and targeted advertising
  directed at children and requires parental consent for processing their data — keep data
  minimal (don't profile, don't advertise to under-18s).
- **Security safeguards** are a statutory duty; failure carries penalties **up to ₹250 crore**.
  You are already strong: no card data stored (Razorpay tokenises), RBAC + audit logs,
  signature-verified webhooks. Document this and rotate secrets (§9).
- Breach = report to the Data Protection Board + affected users. Keep the audit trail ready.

---

## 7. Venue contracts (business-critical, even if not "regulatory")

- **Get written permission from every cinema/mall before going live there.** Large chains
  (PVR, INOX, Cinepolis) typically hold **exclusive F&B contracts** with a partner — onboard a
  venue only after checking this, or you invite injunctions.
- The venue agreement should cover: allowed delivery zones (which screens/rows), runner
  movement rules, revenue share if any, insurance/liability allocation, data ownership, and
  exit/notice terms.
- **Alcohol stays out of the catalog.** Selling alcohol in-seat requires state excise licences
  and changes the entire legal profile of the platform.

---

## 8. Store onboarding paperwork (per store, keep in one folder)

1. Signed **merchant agreement**: commission %, settlement cycle (T+7 typical via Route),
   food-safety and FSSAI responsibility explicitly on the store, indemnity, price-change and
   termination notice.
2. Store KYC set: PAN, GSTIN (if any), FSSAI registration, bank details, signed agent letter
   for whoever operates the store tablet.
3. Razorpay Route linked account created + KYC completed.
4. Product list with MRP, allergens, prep times (all already modelled in the app).

---

## 9. What actually gets platforms in trouble (ranked)

1. **Money pooling** — collecting and distributing payments without gateway/PA structure.
   *Mitigated: Razorpay Route is the architecture.*
2. **GST evasion on commission / wrong 9(5) treatment** — register, file monthly, CA sign-off.
3. **Food-safety incident traced to the platform** — contracts + FSSAI numbers displayed.
4. **No grievance officer / missing policies** — CPA fines, app-store takedowns, court notices.
5. **Data breach with absent safeguards** — DPDP penalties; do the basics and document them.

---

## 10. Launch checklist (tick in order)

- [ ] Incorporate entity (Pvt Ltd / OPC); PAN, TAN, current account
- [ ] GSTIN obtained; CA engaged for the §3 (9(5)/TCS) structuring
- [ ] Razorpay account in the **company's** name; Route enabled; linked account per store
- [ ] Merchant agreement signed by every onboarded store
- [ ] Written venue permission for every cinema/mall
- [ ] Site pages live: Terms, Privacy, Refund/Cancellation, Grievance Officer
- [ ] FSSAI numbers displayed on every store profile
- [ ] Trademark search done; filing filed
- [ ] Secrets rotated (GitHub PAT, Vercel token, DB password, Razorpay keys) and stored in a
      password manager — all of these passed through chat during development
- [ ] Monthly compliance calendar set: GSTR-1/3B (and GSTR-8 if applicable), invoice stores,
      reconcile Route settlements vs. app ledger
