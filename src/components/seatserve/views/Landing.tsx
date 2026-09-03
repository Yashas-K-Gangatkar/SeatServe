'use client'

// SeatServe — landing / demo hub (#/)
// Customer app front door (no login — seat QR flow) + staff portal entry.
// Seat QR tokens are RANDOM capabilities now (audit fix #15), so the demo
// entry seat is resolved from /api/demo/entry instead of a hardcoded token.
import { useEffect, useState } from 'react'
import { Clapperboard, LockKeyhole, QrCode, Search, Info } from 'lucide-react'
import { get } from '@/lib/client/api'

interface DemoEntry {
  aurora: { qrToken: string; seat: string; screen: string; mall: string } | null
  auroraBlocked: { qrToken: string; seat: string; screen: string } | null
  nexora: { qrToken: string; seat: string; screen: string; mall: string } | null
}

function useDemoEntry(): DemoEntry | null {
  const [entry, setEntry] = useState<DemoEntry | null>(null)
  useEffect(() => {
    let cancelled = false
    void get<DemoEntry>('/api/demo/entry')
      .then((d) => {
        if (!cancelled) setEntry(d)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])
  return entry
}

const HOW_STEPS = [
  'Scan the QR at your seat — the menu opens with the stores inside your mall.',
  'Add items from different stores to ONE cart, then pay by UPI or card.',
  'Track live — each store has its own status ticket. Cancel with automatic money-back until the kitchen accepts.',
  'Staff run scoped consoles — a kitchen sees only its tickets, runners their own runs, the mall admin the whole venue.',
]

export default function SeatLanding({ go }: { go: (path: string) => void }) {
  const entry = useDemoEntry()
  const seatToken = entry?.aurora?.qrToken ?? null
  const seatLabel = entry?.aurora ? `Seat ${entry.aurora.seat}` : 'your seat'
  const nexoraToken = entry?.nexora?.qrToken ?? null

  const consoles = [
    ...(seatToken
      ? [
          {
            href: `#/seat/${seatToken}`,
            icon: QrCode,
            title: `Customer · ${seatLabel}`,
            sub: 'Scan-to-order menu, one cart across stores, UPI or card payment, live tracking',
            tint: 'text-orange-500 bg-orange-100',
            tag: 'START HERE',
          },
        ]
      : []),
    ...(nexoraToken
      ? [
          {
            href: `#/seat/${nexoraToken}` as string | null,
            icon: QrCode,
            title: `Customer · ${entry?.nexora?.mall} ${entry?.nexora?.seat}`,
            sub: 'SECOND MALL — same platform, isolated stores, proves multi-tenancy',
            tint: 'text-sky-600 bg-sky-100',
            tag: 'ISOLATION',
          },
        ]
      : []),
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
          One QR per seat. One cart across many stores. One payment by UPI or card, automatically split — every store sees
          only its own ticket. Live payments by Razorpay, and you can cancel with automatic money-back any time before a
          store accepts your order.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {seatToken && (
            <button
              onClick={() => go(`#/seat/${seatToken}`)}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-amber-500 to-orange-500 px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-orange-500/30 transition hover:from-amber-600 hover:to-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
            >
              <QrCode className="h-4 w-4" aria-hidden /> Open {seatLabel}
            </button>
          )}
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {consoles.map((c) => (
            <a
              key={c.title}
              href={c.href ?? '#'}
              aria-disabled={!c.href}
              className={`group relative overflow-hidden rounded-2xl border border-stone-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-lg hover:shadow-orange-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 ${c.href ? '' : 'pointer-events-none opacity-50'}`}
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

      {/* how it works */}
      <section className="mt-10 rounded-2xl border border-border bg-card p-5 sm:p-6" aria-label="How it works">
        <div className="flex items-center gap-2">
          <Clapperboard className="h-5 w-5 text-orange-500" aria-hidden />
          <h2 className="font-bold">How it works</h2>
        </div>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2">
          {HOW_STEPS.map((step, i) => (
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
            <b>Live today:</b> real payments run through Razorpay — pay once, every store is routed its share
            automatically, and the money returns to your account by itself if you cancel before the kitchen accepts.
          </p>
        </div>
      </section>

      {/* what's live */}
      <section className="mt-10" aria-label="Live platform capabilities">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">What's live today</h2>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { p: 'Payments', t: 'Real UPI & cards', d: 'Razorpay checkout — pay once and every store is routed its share automatically.' },
            { p: 'Cancel window', t: 'Change of mind?', d: 'Cancel with automatic money-back until a kitchen taps Accept — then it locks.' },
            { p: 'Tracking', t: 'Live per-store status', d: 'Accepted → preparing → ready → runner picks up → at your seat, in realtime.' },
            { p: 'Staff', t: 'Scoped consoles', d: 'Kitchen, runner, cinema and mall roles each see only their own work.' },
          ].map((ph) => (
            <div key={ph.p} className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-[10px] font-extrabold tracking-wider text-orange-600">{ph.p.toUpperCase()}</p>
              <h3 className="mt-1 text-sm font-bold text-stone-900">{ph.t}</h3>
              <p className="mt-1 text-xs leading-relaxed text-stone-500">{ph.d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
