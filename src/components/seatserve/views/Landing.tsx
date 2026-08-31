'use client'

// SeatServe — public landing (#/).
// Apple-style: one page, one job — get the visitor to scan their seat QR.
// All platform/architecture detail lives on /developers; staff entry is a
// small footer/header link. Payments are simulated — say it once, kindly.
import { useEffect, useState } from 'react'
import Image from 'next/image'
import QRCode from 'qrcode'
import {
  ScanLine, UtensilsCrossed, Wallet, BellRing, Zap, Target, Copy,
  ShieldCheck, BadgeCheck, Rocket, ArrowRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { get } from '@/lib/client/api'
import { rupees } from '../ui-bits'
import { FaqAccordion } from '@/components/site/FaqAccordion'
import { LANDING_FAQ } from '@/components/site/faq-data'
import FlowDemo from '@/components/site/FlowDemo'

interface DemoEntry {
  aurora: { qrToken: string; seat: string; screen: string; mall: string } | null
  auroraBlocked: { qrToken: string; seat: string; screen: string } | null
  nexora: { qrToken: string; seat: string; screen: string; mall: string } | null
}

interface PreviewItem {
  name: string
  pricePaise: number
  img: string
  store: string
}

const FALLBACK_MENU: PreviewItem[] = [
  { name: 'Margherita Pizza', pricePaise: 24900, img: '/landing/pizza.png', store: 'Pizza Corner' },
  { name: 'Butter Popcorn', pricePaise: 18000, img: '/landing/popcorn.png', store: 'Cinema Snacks' },
  { name: 'Masala Chai', pricePaise: 6000, img: '/landing/chai.png', store: 'Dosa Junction' },
  { name: 'Punjabi Samosa', pricePaise: 9000, img: '/landing/samosa.png', store: 'Mithai & More' },
]

const STEPS = [
  { icon: ScanLine, title: 'Scan', desc: 'Point at the QR on your seat' },
  { icon: UtensilsCrossed, title: 'Browse', desc: 'Every store in one cart' },
  { icon: Wallet, title: 'Pay', desc: 'One tap. UPI or card.' },
  { icon: BellRing, title: 'Track', desc: 'Watch it reach your seat' },
]

const BENEFITS = [
  { icon: Zap, title: 'Faster than the line', desc: 'Food in ~8 minutes, not 20', stat: '8 min' },
  { icon: Target, title: 'Order from any store', desc: 'Pizza, popcorn & chai in one order', stat: '5 stores' },
  { icon: Wallet, title: 'One payment', desc: 'Split across stores automatically', stat: '1 tap' },
]

const GOLD = 'bg-[#D4AF37] text-[#1A1A1A] hover:bg-[#C39B2A]'

export default function SeatLanding({ go }: { go: (path: string) => void }) {
  const [entry, setEntry] = useState<DemoEntry | null>(null)
  const [menu, setMenu] = useState<PreviewItem[]>(FALLBACK_MENU)
  const [qrData, setQrData] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void get<DemoEntry>('/api/demo/entry')
      .then((d) => { if (!cancelled) setEntry(d) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  const seatToken = entry?.aurora?.qrToken ?? null
  const seatLabel = entry?.aurora ? `Seat ${entry.aurora.seat}` : 'the demo seat'

  // Real menu preview from the live demo seat (falls back to curated items).
  useEffect(() => {
    if (!seatToken) return
    let cancelled = false
    void get<{ stores: { id: string; name: string; products: { id: string; name: string; pricePaise: number }[] }[] }>(
      `/api/context?qr=${encodeURIComponent(seatToken)}`,
    )
      .then((ctx) => {
        if (cancelled) return
        const key: Record<string, string> = { pizza: '/landing/pizza.png', popcorn: '/landing/popcorn.png', chai: '/landing/chai.png', samosa: '/landing/samosa.png' }
        const picked: PreviewItem[] = []
        for (const store of ctx.stores) {
          for (const p of store.products) {
            const k = Object.keys(key).find((w) => p.name.toLowerCase().includes(w))
            if (k && !picked.some((x) => x.img === key[k])) {
              picked.push({ name: p.name, pricePaise: p.pricePaise, img: key[k], store: store.name })
            }
          }
        }
        if (picked.length >= 3) setMenu(picked.slice(0, 4))
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [seatToken])

  // Live phone-QR: scanning it with a phone camera opens the demo seat there.
  useEffect(() => {
    if (!seatToken) return
    const url = `${window.location.origin}/?qr=${seatToken}`
    void QRCode.toDataURL(url, { width: 360, margin: 1, color: { dark: '#1A1A1A', light: '#FAF8F5' } })
      .then(setQrData)
      .catch(() => undefined)
  }, [seatToken])

  return (
    <div className="site-root min-h-dvh bg-[#FAF8F5] text-[#1A1A1A]">
      {/* ── header ── */}
      <header className="sticky top-0 z-40 border-b border-[#EFEAE0] bg-[#FAF8F5]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="flex items-center gap-1.5 text-[17px] font-extrabold tracking-tight" aria-label="SeatServe home">
            <span aria-hidden>🍿</span> SeatServe
          </a>
          <a href="/staff" className="min-h-[44px] px-2 py-3 text-sm text-[#6F6F6F] transition-colors hover:text-[#1A1A1A]">
            Staff sign in
          </a>
        </div>
      </header>

      <main>
        {/* ── hero ── */}
        <section className="mx-auto max-w-5xl px-4 pb-14 pt-12 text-center sm:px-6 sm:pb-20 sm:pt-20">
          <h1 className="ss-rise mx-auto max-w-3xl text-[40px] font-bold leading-[1.05] tracking-tight sm:text-[56px]">
            Snacks at Your Seat
          </h1>
          <p className="ss-rise mx-auto mt-4 max-w-xl text-lg font-normal text-[#6F6F6F] sm:text-[22px]" style={{ animationDelay: '0.08s' }}>
            Scan QR. Order. Delivered.
          </p>
          <div className="ss-rise mx-auto mt-8 flex w-full max-w-xs flex-col items-center gap-3 sm:max-w-none sm:flex-row sm:justify-center" style={{ animationDelay: '0.16s' }}>
            <a
              href="/scan"
              className={`inline-flex h-12 w-full items-center justify-center rounded-xl px-8 text-[15px] font-bold shadow-[0_4px_12px_rgba(212,175,55,0.35)] transition-all hover:shadow-[0_8px_20px_rgba(212,175,55,0.45)] active:scale-[0.98] sm:w-[200px] ${GOLD}`}
            >
              <ScanLine className="mr-2 h-4.5 w-4.5" aria-hidden /> Scan QR Code
            </a>
            <button
              type="button"
              onClick={() => seatToken && go(`#/seat/${seatToken}`)}
              disabled={!seatToken}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-[#D8D3C8] bg-transparent px-8 text-[15px] font-bold text-[#1A1A1A] transition-all hover:bg-white active:scale-[0.98] disabled:opacity-50 sm:w-[200px]"
            >
              Try Demo
            </button>
          </div>
          <p className="ss-rise mt-4 text-[13px] text-[#8B8B8B]" style={{ animationDelay: '0.22s' }}>
            No real charges · Live demo at Aurora Mall, Mumbai
          </p>

          {/* flow demo (45s looping animation — video slot ready) */}
          <div className="ss-rise mx-auto mt-12 max-w-2xl" style={{ animationDelay: '0.28s' }}>
            <FlowDemo />
          </div>
        </section>

        {/* ── magic moment: live notification ── */}
        <section aria-label="Live notification" className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="grid items-center gap-8 sm:grid-cols-2">
            <div>
              <h2 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[36px]">
                You&rsquo;ll know the second it&rsquo;s ready.
              </h2>
              <p className="mt-3 max-w-md text-base leading-[1.6] text-[#6F6F6F]">
                Live status for every store lands straight on your phone — from kitchen fire to runner at your row.
              </p>
            </div>
            <div className="rounded-2xl bg-[#111114] p-6 sm:p-8">
              <div className="mx-auto max-w-sm rounded-2xl bg-white/95 p-4 shadow-xl backdrop-blur">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#D4AF37] text-sm" aria-hidden>🍕</span>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#8B8B8B]">Pizza Corner · now</span>
                </div>
                <p className="mt-2 text-[15px] font-bold leading-snug">Your pizza is ready. Seat B7 — coming now!</p>
                <p className="mt-2 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700">
                  ⚡ Arrived 2 min early
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── how it works ── */}
        <section aria-label="How it works" className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="text-center text-[28px] font-bold tracking-tight sm:text-[36px]">How it works</h2>
          <div className="mt-10 grid grid-cols-2 gap-8 sm:grid-cols-4 sm:gap-6">
            {STEPS.map((s) => (
              <div key={s.title} className="flex flex-col items-center text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F3EDDD]">
                  <s.icon className="h-8 w-8 text-[#8a6d1f]" aria-hidden />
                </span>
                <h3 className="mt-4 text-base font-bold">{s.title}</h3>
                <p className="mt-1 max-w-[180px] text-sm leading-snug text-[#6F6F6F]">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── why seatserve ── */}
        <section aria-label="Why SeatServe" className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="text-center text-[28px] font-bold tracking-tight sm:text-[36px]">Why SeatServe</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-3 sm:gap-6">
            {BENEFITS.map((b) => (
              <div
                key={b.title}
                className="rounded-2xl bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-[0_10px_28px_rgba(0,0,0,0.12)]"
              >
                <span className="text-[26px] font-black tracking-tight text-[#D4AF37]">{b.stat}</span>
                <div className="mt-2 flex items-center gap-2">
                  <b.icon className="h-5 w-5 text-[#8a6d1f]" aria-hidden />
                  <h3 className="text-base font-bold">{b.title}</h3>
                </div>
                <p className="mt-1 text-sm leading-[1.6] text-[#6F6F6F]">{b.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── menu preview ── */}
        <section aria-label="Menu preview" className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="text-center text-[28px] font-bold tracking-tight sm:text-[36px]">Straight from the menus</h2>
          <p className="mx-auto mt-3 max-w-md text-center text-base text-[#6F6F6F]">
            Real items from the stores at Aurora Mall — tap add to open the live demo.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {menu.map((m) => (
              <div
                key={m.name}
                className="ss-imgzoom overflow-hidden rounded-2xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-[0_10px_28px_rgba(0,0,0,0.12)]"
              >
                <div className="relative aspect-video w-full overflow-hidden">
                  <Image src={m.img} alt={m.name} fill sizes="(max-width: 640px) 50vw, 25vw" className="object-cover" />
                </div>
                <div className="p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#8B8B8B]">{m.store}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-[15px] font-bold">{m.name}</h3>
                      <p className="text-sm font-extrabold tabular text-[#1A1A1A]">{rupees(m.pricePaise)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (seatToken) {
                          go(`#/seat/${seatToken}`)
                          toast.success(`Demo seat open — add ${m.name} there`, { duration: 4000 })
                        } else {
                          toast.error('Demo seat is loading — try again in a second', { duration: 4000 })
                        }
                      }}
                      className="inline-flex h-11 min-w-[64px] items-center justify-center rounded-xl border border-[#D4AF37] bg-transparent px-4 text-sm font-bold text-[#8a6d1f] transition-all hover:bg-[#D4AF37] hover:text-[#1A1A1A] active:scale-[0.98]"
                      aria-label={`Add ${m.name} — opens the demo`}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── FAQ ── */}
        <section aria-label="Frequently asked questions" className="mx-auto max-w-2xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="text-center text-[28px] font-bold tracking-tight sm:text-[36px]">Questions, answered</h2>
          <div className="mt-8">
            <FaqAccordion items={LANDING_FAQ} />
          </div>
          <p className="mt-4 text-center text-sm text-[#6F6F6F]">
            More questions? <a href="/faq" className="font-semibold text-[#8a6d1f] underline underline-offset-2">See the full FAQ</a>
          </p>
        </section>

        {/* ── trust ── */}
        <section aria-label="Trust and safety" className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6 sm:pb-24">
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              { icon: ShieldCheck, title: '100% secure payments', desc: 'Bank-grade gateway — and this demo never charges a rupee.' },
              { icon: BadgeCheck, title: 'Real cinema pilot', desc: 'Running live at Aurora Mall, Mumbai — not a mockup.' },
              { icon: Rocket, title: 'Zero setup', desc: 'No app, no sign-up. Scan and go.' },
            ].map((t) => (
              <div key={t.title} className="flex items-start gap-3">
                <t.icon className="mt-0.5 h-5 w-5 shrink-0 text-[#8a6d1f]" aria-hidden />
                <div>
                  <h3 className="text-[15px] font-bold">{t.title}</h3>
                  <p className="mt-0.5 text-sm leading-[1.6] text-[#6F6F6F]">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── try on your phone (live QR) ── */}
        {qrData && seatToken && (
          <section aria-label="Try on your phone" className="mx-auto max-w-5xl px-4 pb-16 sm:px-6 sm:pb-24">
            <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-[#E7E2D8] bg-white p-6 text-center shadow-[0_4px_12px_rgba(0,0,0,0.06)] sm:flex-row sm:text-left">
              <Image src={qrData} alt={`QR code that opens ${seatLabel} on your phone`} width={120} height={120} className="rounded-xl border border-[#EFEAE0]" unoptimized />
              <div>
                <h2 className="text-base font-bold">Try it on your phone</h2>
                <p className="mt-1 text-sm leading-[1.6] text-[#6F6F6F]">
                  Point your phone camera here to open {seatLabel} — the exact flow a movie-goer gets.
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(`${window.location.origin}/?qr=${seatToken}`)
                      toast.success('Link copied', { duration: 4000 })
                    } catch {
                      toast.error('Copy failed — long-press the QR instead', { duration: 4000 })
                    }
                  }}
                  className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#D8D3C8] px-3 py-2 text-[13px] font-bold text-[#1A1A1A] hover:bg-[#FBF9F3] active:scale-[0.98]"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden /> Copy link
                </button>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* ── footer ── */}
      <footer className="mt-auto bg-[#141414] pb-[env(safe-area-inset-bottom)] text-stone-400">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 sm:grid-cols-4 sm:px-6">
          <div>
            <p className="flex items-center gap-1.5 text-[17px] font-extrabold text-white" aria-hidden>🍿 SeatServe</p>
            <p className="mt-2 max-w-[220px] text-sm leading-[1.6]">Snacks from every store, delivered to your cinema seat.</p>
          </div>
          <nav aria-label="Explore">
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Explore</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href="/scan" className="hover:text-white">Scan a seat QR</a></li>
              <li><a href="/faq" className="hover:text-white">FAQ</a></li>
              <li><a href="/#/track" className="inline-flex min-h-[44px] items-center gap-1 hover:text-white">Track an order <ArrowRight className="h-3 w-3" aria-hidden /></a></li>
            </ul>
          </nav>
          <nav aria-label="Legal">
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Legal</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href="/legal/privacy" className="hover:text-white">Privacy policy</a></li>
              <li><a href="/legal/terms" className="hover:text-white">Terms of use</a></li>
              <li><a href="/legal/refund" className="hover:text-white">Refunds &amp; cancellation</a></li>
            </ul>
          </nav>
          <nav aria-label="Staff and developers">
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Team</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href="/staff" className="hover:text-white">Staff? Sign in here →</a></li>
              <li><a href="/developers" className="hover:text-white">Developers</a></li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-white/10 py-5 text-center text-[13px] text-stone-500">
          © 2026 SeatServe · Demo — no real payments are processed.
        </div>
      </footer>
    </div>
  )
}
