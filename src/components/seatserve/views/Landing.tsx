'use client'

// SeatServe — landing / demo hub (#/)
// Customer app front door (no login — seat QR flow) + staff portal entry.
import { Clapperboard, LockKeyhole, QrCode, Search, Info } from 'lucide-react'
import { rupees } from '../ui-bits'

const CONSOLES = [
  {
    href: '#/seat/A3-F12',
    icon: QrCode,
    title: 'Customer · Seat F-12',
    sub: 'Scan-to-order menu, cart across stores, mock UPI/Card payment, live tracking',
    tint: 'text-orange-500 bg-orange-100',
    tag: 'START HERE',
  },
  {
    href: '#/track',
    icon: Search,
    title: 'Track an order',
    sub: 'Enter your order code (e.g. SS-7HYVEV) for per-store live status',
    tint: 'text-emerald-600 bg-emerald-100',
    tag: 'CUSTOMER',
  },
  {
    href: '#/staff',
    icon: LockKeyhole,
    title: 'Staff portal',
    sub: 'Kitchen · Runner · Cinema · Mall admin — sign-in required, every console scoped by role',
    tint: 'text-violet-600 bg-violet-100',
    tag: 'STAFF LOGIN',
  },
]

const DEMO_STEPS = [
  'Open “Customer · Seat F-12” (or scan a QR from the generator page).',
  'Add items from 2–3 different stores to ONE cart, then pay (mock UPI).',
  'You land on live tracking — each store has its own status ticket.',
  'Sign in to the staff portal as a cook (e.g. kitchen@pizza-corner.demo) — only their tickets appear.',
  'Advance to “Ready”, deliver as the runner (ravi@runner.demo), watch tracking update in realtime.',
]

export default function SeatLanding({ go }: { go: (path: string) => void }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-10 sm:px-6">
      {/* hero */}
      <header className="mb-10">
        <p className="mb-2 text-xs font-extrabold tracking-[0.18em] text-orange-600">AURORA MALL · MULTI-STORE IN-SEAT ORDERING</p>
        <h1 className="max-w-2xl text-4xl font-black leading-[1.05] tracking-tight text-stone-900 sm:text-6xl">
          Snacks, pizza &amp; chai —{' '}
          <span className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 bg-clip-text text-transparent">
            delivered to your seat.
          </span>
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-stone-600 sm:text-base">
          One QR per seat. One cart across many stores. One payment, automatically split — every store sees only its own
          ticket. This is the Phase 1 sandbox demo: payments are mocked end-to-end (signed webhooks, idempotency), no real
          money moves.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => go('#/seat/A3-F12')}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-amber-500 to-orange-500 px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-orange-500/30 transition hover:from-amber-600 hover:to-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
          >
            <QrCode className="h-4 w-4" aria-hidden /> Open seat F-12
          </button>
          <button
            onClick={() => go('#/staff/login')}
            className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white/70 px-5 py-3 text-sm font-bold text-stone-800 shadow-sm transition hover:border-stone-400 hover:bg-white"
          >
            <LockKeyhole className="h-4 w-4" aria-hidden /> Staff sign in
          </button>
        </div>
      </header>

      {/* consoles */}
      <section aria-label="Demo consoles">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">Two apps, one platform</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {CONSOLES.map((c) => (
            <a
              key={c.href}
              href={c.href}
              className="group relative overflow-hidden rounded-2xl border border-stone-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-lg hover:shadow-orange-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
            >
              <div className="flex items-start justify-between gap-3">
                <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${c.tint} transition group-hover:scale-105`}>
                  <c.icon className="h-5.5 w-5.5" aria-hidden />
                </span>
                <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] font-bold tracking-wider text-stone-500">
                  {c.tag}
                </span>
              </div>
              <h3 className="mt-3 font-bold text-stone-900">{c.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-stone-500">{c.sub}</p>
            </a>
          ))}
        </div>
      </section>

      {/* guided demo */}
      <section className="mt-10 rounded-2xl border border-border bg-card p-5 sm:p-6" aria-label="Guided demo">
        <div className="flex items-center gap-2">
          <Clapperboard className="h-5 w-5 text-orange-500" aria-hidden />
          <h2 className="font-bold">60-second guided demo</h2>
        </div>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2">
          {DEMO_STEPS.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-stone-600">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-extrabold text-amber-700">
                {i + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-stone-200 pt-4">
          <p className="text-xs text-stone-500">
            <b>Phase 2:</b> staff consoles are now behind sign-in. Reset &amp; maintenance moved to the staff portal (mall admin).
          </p>
        </div>
      </section>

      {/* phase roadmap */}
      <section className="mt-10" aria-label="Roadmap">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Build phases</h2>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { p: 'Phase 1', t: 'Clickable demo', d: 'Fake payment + simulated order flow, realtime staff dashboards, QR codes', state: 'done' },
            { p: 'Phase 2', t: 'Platform core', d: 'Auth + RBAC (6 roles), scoped staff portal, session security, tests — YOU ARE HERE', state: 'current' },
            { p: 'Phase 3', t: 'Real sandbox rails', d: 'Razorpay Route / Cashfree Easy Split, signed webhooks, refunds, settlements', state: 'later' },
            { p: 'Phase 4', t: 'Production', d: 'PostgreSQL migration, merchant KYC onboarding, security & legal review, deployment', state: 'later' },
          ].map((ph) => (
            <div
              key={ph.p}
              className={`rounded-2xl border p-4 ${
                ph.state === 'current' ? 'border-orange-300 bg-orange-50 shadow-sm shadow-orange-500/10' : 'border-stone-200 bg-white'
              }`}
            >
              <p className="text-[10px] font-extrabold tracking-wider text-stone-500">{ph.p.toUpperCase()}</p>
              <h3 className={`mt-1 text-sm font-bold ${ph.state === 'current' ? 'text-orange-700' : 'text-stone-900'}`}>{ph.t}</h3>
              <p className="mt-1 text-xs leading-relaxed text-stone-500">{ph.d}</p>
              {ph.state === 'current' && <p className="mt-2 text-[10px] font-bold text-orange-600">← YOU ARE HERE</p>}
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground/70">
          Settlement ledger preview: every order writes a split ledger (STORE / PLATFORM_COMMISSION / DELIVERY_FEE / TAX) whose
          amounts always sum to the paid total. Live sample: seeded order SS-DEMO02 totals {rupees(75440)} with a verified split.
        </p>
      </section>
    </div>
  )
}
