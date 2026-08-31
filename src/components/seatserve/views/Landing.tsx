'use client'

// SeatServe — public landing (#/).
// Apple-style: one page, one job — get the visitor to scan their seat QR.
// All platform/architecture detail lives on /developers; staff entry is a
// small footer/header link. Payments are simulated — say it once, kindly.
import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import {
  ScanLine, UtensilsCrossed, Wallet, BellRing, Zap, Target,
  ShieldCheck, BadgeCheck, Rocket, ArrowRight, MapPin, Check, CheckCircle2,
  Star, Clock, Clapperboard, Lock, RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { get } from '@/lib/client/api'
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

// Curated fallback = real items from the demo seed (names, stores, prices).
const FALLBACK_MENU: PreviewItem[] = [
  { name: 'Margherita (10")', pricePaise: 25000, img: '/landing/pizza.png', store: 'Pizza Corner' },
  { name: 'Butter Popcorn (L)', pricePaise: 22000, img: '/landing/popcorn.png', store: 'Cinema Snacks' },
  { name: 'Nachos with Cheese', pricePaise: 24000, img: '/landing/nachos.png', store: 'Cinema Snacks' },
  { name: 'Cold Coffee', pricePaise: 14000, img: '/landing/coffee.png', store: 'Cinema Snacks' },
  { name: 'Paneer Tikka Wrap', pricePaise: 21000, img: '/landing/wrap.png', store: 'Wrap House' },
  { name: 'Peri Peri Fries', pricePaise: 11000, img: '/landing/fries.png', store: 'Wrap House' },
  { name: 'Masala Dosa', pricePaise: 12000, img: '/landing/dosa.png', store: 'Dosa Junction' },
  { name: 'Gulab Jamun (2 pc)', pricePaise: 8000, img: '/landing/jamun.png', store: 'Mithai & More' },
]

// Store chip emoji for the menu carousel badges.
const STORE_EMOJI: Record<string, string> = {
  'Pizza Corner': '🍕',
  'Cinema Snacks': '🍿',
  'Wrap House': '🌯',
  'Dosa Junction': '🥘',
  'Mithai & More': '🍮',
}

const STEPS = [
  { icon: ScanLine, title: 'Scan', desc: 'Point at the QR on your seat' },
  { icon: UtensilsCrossed, title: 'Browse', desc: 'Every store in one cart' },
  { icon: Wallet, title: 'Pay', desc: 'One tap. UPI or card.' },
  { icon: BellRing, title: 'Track', desc: 'Watch it reach your seat' },
]

const BENEFITS = [
  { icon: Zap, title: 'Faster than the line', desc: 'Food in ~8 minutes, not 20', stat: '8 min', visual: 'bars' as const },
  { icon: Target, title: 'Order from any store', desc: 'Pizza, popcorn & chai in one order', stat: '5 stores', visual: 'dots' as const },
  { icon: Wallet, title: 'One payment', desc: 'Split across stores automatically', stat: '1 tap', visual: 'check' as const },
]

const STATS = [
  { icon: Clapperboard, num: '500+', label: 'Orders Delivered', sub: 'Served across the Aurora pilot' },
  { icon: Zap, num: '8 min', label: 'Average Delivery', sub: 'From kitchen fire to seat B-row' },
  { icon: ShieldCheck, num: '100%', label: 'Secure & Verified', sub: 'Bank-grade gateway · demo never charges' },
]

const REVIEWS = [
  { stars: 5, quote: 'Got my pizza in just 6 minutes! No waiting in line 🍕', name: 'Priya M.', place: 'Mumbai', when: '2 weeks ago' },
  { stars: 5, quote: 'Ordered for my whole friend group — everything split perfectly at checkout 💳', name: 'Raj K.', place: 'Delhi', when: '1 week ago' },
  { stars: 5, quote: "Finally don't have to miss half the movie waiting for snacks!", name: 'Ananya S.', place: 'Bengaluru', when: '3 days ago' },
]

const GOLD = 'bg-[#D4AF37] text-[#1A1A1A] hover:bg-[#C39B2A]'
const GOLD_TINT = 'text-[#8a6d1f]'

const price = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`

/* ── Scroll-reveal: IntersectionObserver, no deps, reduced-motion safe ── */
function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // reveal = add the class on the external DOM system (no cascading setState)
    const show = () => el.classList.add('ss-reveal-in')
    if (typeof IntersectionObserver === 'undefined') { show(); return }
    const io = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) { show(); io.disconnect() } },
      { threshold: 0.2, rootMargin: '0px 0px -80px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`ss-reveal ${className}`}
    >
      {children}
    </div>
  )
}

/* ── iPhone-style notification: slides in from the top every 5.5s ── */
function IphoneNotif() {
  return (
    <div className="mx-auto w-[300px] rounded-[2.6rem] border-[10px] border-black/90 bg-[#0B0B0F] shadow-2xl">
      <div className="relative overflow-hidden rounded-[2rem] px-3 pb-5 pt-2.5">
        {/* status bar — 9:41 like the mockups */}
        <div className="flex items-center justify-between px-2 text-[11px] font-semibold text-white/90">
          <span className="tabular">9:41</span>
          <span className="flex items-center gap-1" aria-hidden>
            <span className="inline-block h-1.5 w-3 rounded-sm bg-white/90" />
            <span className="inline-block h-2.5 w-5 rounded-[3px] border border-white/90"><span className="block h-full w-3/4 rounded-sm bg-white/90" /></span>
          </span>
        </div>
        {/* the notification itself */}
        <div className="mt-3">
          <div className="ss-notif rounded-2xl bg-white p-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#D4AF37] text-base" aria-hidden>🍿</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#8B8B8B]">
                  <span>Pizza Corner</span>
                  <span className="font-semibold normal-case tracking-normal">now</span>
                </p>
                <p className="mt-0.5 truncate text-[14px] font-bold leading-tight text-[#1A1A1A]">Your pizza is ready!</p>
              </div>
            </div>
            <p className="mt-1.5 text-[13px] leading-snug text-[#3F3F3F]">Seat B7 · Coming now</p>
            <p className="mt-2 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">
              ⚡ Arrived 2 min early
            </p>
          </div>
        </div>
        {/* home indicator */}
        <div className="mx-auto mt-4 h-1 w-24 rounded-full bg-white/40" aria-hidden />
      </div>
    </div>
  )
}

/* ── Interactive step demos: a looping 3-frame CSS animation per step ── */
function StepPanel({ step }: { step: number }) {
  if (step === 0) {
    return (
      <div className="flex items-center gap-5">
        <div className="relative h-40 w-24 shrink-0 rounded-[1.4rem] border-[5px] border-[#1A1A1A] bg-white">
          <div className="absolute inset-2 grid grid-cols-3 place-content-center gap-1" aria-hidden>
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} className={`h-2.5 w-2.5 rounded-[2px] ${i % 2 ? 'bg-[#1A1A1A]' : 'bg-[#D8D3C8]'}`} />
            ))}
          </div>
          <div className="ss-scanline absolute inset-x-1.5 h-0.5 rounded-full bg-[#D4AF37] shadow-[0_0_8px_rgba(212,175,55,0.8)]" />
        </div>
        <div className="relative">
          <span className="ss-check-pop flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg">
            <Check className="h-6 w-6" aria-hidden />
          </span>
          <p className="mt-2 text-sm font-bold">Seat B7 found</p>
          <p className="text-xs text-[#6F6F6F]">Menu opens by itself</p>
        </div>
      </div>
    )
  }
  if (step === 1) {
    return (
      <div className="flex-1">
        <div className="space-y-2">
          {[
            { e: '🍕', n: 'Margherita (10")', p: '₹250', d: '0s' },
            { e: '🍿', n: 'Butter Popcorn (L)', p: '₹220', d: '0.18s' },
            { e: '☕', n: 'Cold Coffee', p: '₹140', d: '0.36s' },
          ].map((r) => (
            <div key={r.n} className="ss-row-rise flex items-center justify-between rounded-xl bg-[#FAF8F5] px-3 py-2" style={{ animationDelay: r.d }}>
              <span className="flex items-center gap-2 text-sm font-semibold"><span aria-hidden>{r.e}</span> {r.n}</span>
              <span className="text-sm font-extrabold tabular">{r.p}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs font-bold text-[#8a6d1f]">
          <span className="ss-check-pop flex h-6 w-6 items-center justify-center rounded-full bg-[#D4AF37] text-[11px] text-[#1A1A1A]" aria-hidden>3</span>
          One cart · 3 stores merged
        </div>
      </div>
    )
  }
  if (step === 2) {
    return (
      <div className="flex-1 text-center">
        <div className="mx-auto max-w-[220px] rounded-2xl border border-[#E7E2D8] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-[#6F6F6F]">
            <span>UPI · yash@okaxis</span><span className="tabular text-[#1A1A1A]">₹610</span>
          </div>
          <span className="ss-pay-tap mt-3 flex h-11 items-center justify-center rounded-xl bg-[#D4AF37] text-sm font-extrabold text-[#1A1A1A]">Pay once</span>
          <p className="ss-check-pop mt-3 flex items-center justify-center gap-1.5 text-sm font-bold text-emerald-600">
            <CheckCircle2 className="h-4.5 w-4.5" aria-hidden /> Paid — split to 3 stores
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex-1">
      <div className="relative mx-auto h-16 max-w-[280px]">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#EFEAE0]" aria-hidden />
        <div className="absolute left-0 top-1/2 -translate-y-1/2 text-xl" aria-hidden>🍳</div>
        <div className="ss-run absolute top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-[#D4AF37] text-sm shadow-md" aria-hidden>🛵</div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2 text-xl" aria-hidden>🪑</div>
      </div>
      <p className="mt-2 flex items-center justify-center gap-2 text-sm font-bold">
        <span className="ss-bell inline-block text-base" aria-hidden>🔔</span> Arriving at Seat B7
      </p>
      <p className="text-center text-xs text-[#6F6F6F]">Live status for every store</p>
    </div>
  )
}

/* ── SVG check that draws itself (stroke animation) once scrolled into view ── */
function DrawCheck() {
  return (
    <svg className="ss-draw-check h-6 w-6" viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle className="ss-draw-circle" cx="16" cy="16" r="14" stroke="#D4AF37" strokeWidth="2.5" />
      <path className="ss-draw-path" d="M10 16.5L14.5 21L22 11.5" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function SeatLanding({ go }: { go: (path: string) => void }) {
  const [entry, setEntry] = useState<DemoEntry | null>(null)
  const [menu, setMenu] = useState<PreviewItem[]>(FALLBACK_MENU)
  const [activeStep, setActiveStep] = useState(0)
  const [playKey, setPlayKey] = useState(0)
  const [dot, setDot] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    void get<DemoEntry>('/api/demo/entry')
      .then((d) => { if (!cancelled) setEntry(d) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  const seatToken = entry?.aurora?.qrToken ?? null
  const openDemo = useCallback((itemName?: string) => {
    if (seatToken) {
      go(`#/seat/${seatToken}`)
      if (itemName) toast.success(`Demo seat open — add ${itemName} there`, { duration: 4000 })
    } else {
      toast.error('Demo seat is loading — try again in a second', { duration: 4000 })
    }
  }, [go, seatToken])

  // Real menu preview from the live demo seat (falls back to curated items).
  useEffect(() => {
    if (!seatToken) return
    let cancelled = false
    void get<{ stores: { id: string; name: string; products: { id: string; name: string; pricePaise: number }[] }[] }>(
      `/api/context?qr=${encodeURIComponent(seatToken)}`,
    )
      .then((ctx) => {
        if (cancelled) return
        const IMG_KEY: [string, string][] = [
          ['margherita', '/landing/pizza.png'],
          ['pizza', '/landing/pizza.png'],
          ['popcorn', '/landing/popcorn.png'],
          ['nachos', '/landing/nachos.png'],
          ['cold coffee', '/landing/coffee.png'],
          ['tikka wrap', '/landing/wrap.png'],
          ['peri peri fries', '/landing/fries.png'],
          ['dosa', '/landing/dosa.png'],
          ['jamun', '/landing/jamun.png'],
          ['chai', '/landing/chai.png'],
        ]
        const picked: PreviewItem[] = []
        for (const store of ctx.stores) {
          for (const p of store.products) {
            const k = IMG_KEY.find(([w]) => p.name.toLowerCase().includes(w))
            if (k && !picked.some((x) => x.img === k[1])) {
              picked.push({ name: p.name, pricePaise: p.pricePaise, img: k[1], store: store.name })
            }
          }
        }
        if (picked.length >= 3) setMenu(picked.slice(0, 8))
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [seatToken])

  // Carousel pagination: active dot follows scroll position.
  const onTrackScroll = () => {
    const el = trackRef.current
    if (!el || !el.firstElementChild) return
    const cardW = (el.firstElementChild as HTMLElement).offsetWidth + 16
    setDot(Math.min(menu.length - 1, Math.max(0, Math.round(el.scrollLeft / cardW))))
  }
  const goToCard = (i: number) => {
    const el = trackRef.current
    if (!el || !el.firstElementChild) return
    const cardW = (el.firstElementChild as HTMLElement).offsetWidth + 16
    el.scrollTo({ left: i * cardW, behavior: 'smooth' })
  }

  const pickStep = (i: number) => { setActiveStep(i); setPlayKey((k) => k + 1) }

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
          {/* prominent location badge */}
          <p className="ss-rise mx-auto inline-flex items-center gap-1.5 rounded-full border border-[#D4AF37]/70 bg-[#FAF8F5] px-4 py-2 text-[13px] font-bold shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.12)]" style={{ animationDelay: '0s' }}>
            <MapPin className="h-4 w-4 text-[#8a6d1f]" aria-hidden /> Aurora Mall, Mumbai
          </p>
          <h1 className="ss-rise mx-auto mt-6 max-w-3xl text-[40px] font-bold leading-[1.05] tracking-tight sm:text-[56px]" style={{ animationDelay: '0.04s' }}>
            Snacks at Your Seat
          </h1>
          {/* bigger subtitle on mobile (24px vs old 18px) */}
          <p className="ss-rise mx-auto mt-4 max-w-xl text-2xl font-medium leading-snug tracking-tight text-[#57534E] sm:text-[28px]" style={{ animationDelay: '0.08s' }}>
            Scan QR. Order. Delivered.
          </p>
          <div className="ss-rise mx-auto mt-8 flex w-full max-w-xs flex-col items-center gap-3 sm:max-w-none sm:flex-row sm:justify-center" style={{ animationDelay: '0.16s' }}>
            {/* primary — solid accent */}
            <a
              href="/scan"
              className={`inline-flex h-12 w-full items-center justify-center rounded-xl px-8 text-[15px] font-bold shadow-[0_4px_12px_rgba(212,175,55,0.35)] transition-all hover:scale-[1.02] hover:shadow-[0_8px_20px_rgba(212,175,55,0.45)] active:scale-[0.98] sm:w-[210px] ${GOLD}`}
            >
              <ScanLine className="mr-2 h-4.5 w-4.5" aria-hidden /> Scan QR Code
            </a>
            {/* secondary — outline/ghost, deliberately quieter */}
            <button
              type="button"
              onClick={() => openDemo()}
              disabled={!seatToken}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl border-2 border-[#D4AF37] bg-transparent px-8 text-[15px] font-semibold text-[#8a6d1f] transition-all hover:border-[#C99F2E] hover:bg-[#D4AF37]/10 hover:text-[#C99F2E] active:scale-[0.98] disabled:opacity-50 sm:w-[170px]"
            >
              Try Demo
            </button>
          </div>
          <p className="ss-rise group mx-auto mt-4 inline-flex w-fit items-center gap-1.5 rounded-lg bg-[#D4AF37]/10 px-3 py-1.5 text-[13px] font-bold text-[#8a6d1f]" style={{ animationDelay: '0.22s' }}>
            <RefreshCw className="h-3.5 w-3.5 transition-transform duration-1000 group-hover:rotate-[360deg]" aria-hidden />
            Fresh demo data · Try now — 100% risk-free, no real charges
          </p>

          {/* flow demo (45s looping animation — video slot ready):
              fades in from black on load (1.2s), then a slow infinite zoom loop */}
          <div className="ss-rise mx-auto mt-12 max-w-2xl" style={{ animationDelay: '0.28s' }}>
            <div className="ss-hero-media">
              <FlowDemo />
            </div>
          </div>
        </section>

        {/* ── magic moment: live iPhone notification ── */}
        <section aria-label="Live notification" className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <Reveal className="grid items-center gap-10 sm:grid-cols-2">
            <div className="order-2 sm:order-1">
              <IphoneNotif />
              <p className="mt-4 text-center text-[13px] text-[#8B8B8B]">
                Live push, every step — kitchens, runner, arrival.
              </p>
            </div>
            <div className="order-1 sm:order-2">
              <h2 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[36px]">
                You&rsquo;ll know the second it&rsquo;s ready.
              </h2>
              <p className="mt-3 max-w-md text-base leading-[1.6] text-[#6F6F6F]">
                Live status for every store lands straight on your phone — from kitchen fire to runner at your row.
              </p>
            </div>
          </Reveal>
        </section>

        {/* ── how it works: tap a step, watch it happen ── */}
        <section aria-label="How it works" className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <Reveal>
            <h2 className="text-center text-[28px] font-bold tracking-tight sm:text-[36px]">How it works</h2>
            <p className="mt-3 text-center text-base text-[#6F6F6F]">Tap a step to watch it happen.</p>
            <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4 sm:gap-6">
              {STEPS.map((s, i) => (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => pickStep(i)}
                  aria-expanded={activeStep === i}
                  className={`flex min-h-[44px] flex-col items-center rounded-2xl p-3 text-center transition-all active:scale-[0.97] ${
                    activeStep === i ? 'bg-[#F3EDDD] shadow-[0_4px_12px_rgba(212,175,55,0.18)]' : 'hover:bg-[#F7F3E9]'
                  }`}
                >
                  <span className={`flex h-16 w-16 items-center justify-center rounded-2xl transition-colors ${activeStep === i ? 'bg-[#D4AF37]' : 'bg-[#F3EDDD]'}`}>
                    <s.icon className={`h-8 w-8 ${activeStep === i ? 'text-[#1A1A1A]' : 'text-[#8a6d1f]'}`} aria-hidden />
                  </span>
                  <h3 className="mt-4 text-base font-bold">{s.title}</h3>
                  <p className="mt-1 max-w-[180px] text-sm leading-snug text-[#6F6F6F]">{s.desc}</p>
                </button>
              ))}
            </div>
            {/* live mini-demo for the selected step */}
            <div
              key={playKey}
              role="img"
              aria-label={`Animation showing step ${STEPS[activeStep]?.title ?? ''}`}
              className="mx-auto mt-8 flex min-h-[190px] max-w-xl items-center justify-center gap-6 rounded-2xl border border-[#EFEAE0] bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
            >
              <StepPanel step={activeStep} />
            </div>
          </Reveal>
        </section>

        {/* ── why seatserve ── */}
        <section aria-label="Why SeatServe" className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <Reveal>
            <h2 className="text-center text-[28px] font-bold tracking-tight sm:text-[36px]">Why SeatServe</h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-3 sm:gap-6">
              {BENEFITS.map((b) => (
                <div
                  key={b.title}
                  className="benefit-card rounded-2xl bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-[0_10px_28px_rgba(0,0,0,0.12)]"
                >
                  <span className="text-[26px] font-black tracking-tight text-[#D4AF37]">{b.stat}</span>
                  {/* visual proof under each number */}
                  {b.visual === 'bars' && (
                    <span className="mt-2 flex h-6 items-end gap-1" aria-hidden>
                      <span className="ss-bar h-2 w-2 rounded-sm bg-[#EFEAE0]" style={{ animationDelay: '0s' }} />
                      <span className="ss-bar h-3.5 w-2 rounded-sm bg-[#EFEAE0]" style={{ animationDelay: '0.1s' }} />
                      <span className="ss-bar h-5 w-2 rounded-sm bg-[#EFEAE0]" style={{ animationDelay: '0.2s' }} />
                      <span className="ss-bar h-6 w-2 rounded-sm bg-[#D4AF37]" style={{ animationDelay: '0.3s' }} />
                      <Clock className="ml-1 h-4 w-4 text-[#8a6d1f]" />
                    </span>
                  )}
                  {b.visual === 'dots' && (
                    <span className="mt-2 flex items-center gap-1.5" aria-hidden>
                      {['#D4AF37', '#C4552D', '#7A9E4F', '#8E5A79', '#8a6d1f'].map((c) => (
                        <span key={c} className="h-3 w-3 rounded-full" style={{ backgroundColor: c }} />
                      ))}
                      <span className="ml-1 text-[11px] font-bold uppercase tracking-wider text-[#8B8B8B]">Aurora pilot</span>
                    </span>
                  )}
                  {b.visual === 'check' && (
                    <span className="mt-2 flex items-center gap-1.5" aria-hidden>
                      <DrawCheck />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#8B8B8B]">paid once</span>
                    </span>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <b.icon className="h-5 w-5 text-[#8a6d1f]" aria-hidden />
                    <h3 className="text-base font-bold">{b.title}</h3>
                  </div>
                  <p className="mt-1 text-sm leading-[1.6] text-[#6F6F6F]">{b.desc}</p>
                </div>
              ))}
            </div>
            {/* before / after comparison — "The SeatServe Difference" */}
            <h3 className="mt-12 text-center text-[24px] font-bold tracking-tight">The SeatServe Difference</h3>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 sm:gap-5">
              <div className="rounded-2xl border border-[#C41E3C]/15 bg-[#C41E3C]/[0.05] p-6">
                <p className="text-sm font-extrabold uppercase tracking-wider text-[#C41E3C]">⏳ ❌ Waiting in Line</p>
                <ul className="mt-3 space-y-2">
                  {['20-minute wait', 'Standing in queue', "Can't watch the movie", 'Stressful', 'Miss opening scenes'].map((t) => (
                    <li key={t} className="flex items-start gap-2 text-[14px] leading-[1.5] text-[#505050]">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#C41E3C]/50" aria-hidden /> {t}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-[#D4AF37]/40 bg-[#D4AF37]/[0.1] p-6 shadow-[0_4px_12px_rgba(212,175,55,0.14)]">
                <p className={`text-sm font-extrabold uppercase tracking-wider ${GOLD_TINT}`}>⚡ ✅ SeatServe Order</p>
                <ul className="mt-3 space-y-2">
                  {['8-minute delivery', 'Sitting in your seat', 'Watch the movie', 'Stress-free', 'Real-time tracking'].map((t) => (
                    <li key={t} className="flex items-start gap-2 text-[14px] font-medium leading-[1.5] text-[#9F7D2B]">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#D4AF37]" aria-hidden /> {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── secondary CTA — light-gold band after Why, before menus ── */}
        <section aria-label="Start ordering" className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <Reveal className="rounded-3xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.06] px-6 py-12 text-center sm:px-10">
            <h2 className="text-[26px] font-bold tracking-tight text-[#1A1A1A] sm:text-[32px]">Hungry already?</h2>
            <p className="mx-auto mt-2 max-w-md text-base text-[#6F6F6F]">
              Scan a QR code from your seat or try the live demo below.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="/scan"
                className={`inline-flex h-12 w-full max-w-xs items-center justify-center rounded-xl px-8 text-[15px] font-bold shadow-[0_4px_12px_rgba(212,175,55,0.35)] transition-all hover:scale-[1.02] hover:shadow-[0_8px_20px_rgba(212,175,55,0.45)] active:scale-[0.98] sm:w-[200px] ${GOLD}`}
              >
                <ScanLine className="mr-2 h-4.5 w-4.5" aria-hidden /> Start Ordering
              </a>
              <button
                type="button"
                onClick={() => openDemo()}
                disabled={!seatToken}
                className="inline-flex h-12 w-full max-w-xs items-center justify-center rounded-xl border-2 border-[#D4AF37] bg-transparent px-8 text-[15px] font-semibold text-[#8a6d1f] transition-all hover:border-[#C99F2E] hover:bg-[#D4AF37]/10 hover:text-[#C99F2E] active:scale-[0.98] disabled:opacity-50 sm:w-[170px]"
              >
                Try the Demo
              </button>
            </div>
          </Reveal>
        </section>

        {/* ── menu preview: swipeable carousel ── */}
        <section aria-label="Menu preview" className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <Reveal>
            <h2 className="text-center text-[28px] font-bold tracking-tight sm:text-[36px]">Straight from the menus</h2>
            <p className="mx-auto mt-3 max-w-md text-center text-base text-[#6F6F6F]">
              Real items from the stores at Aurora Mall — swipe through, tap add to open the live demo.
            </p>
          </Reveal>
          <Reveal>
            <div
              ref={trackRef}
              onScroll={onTrackScroll}
              className="no-scrollbar mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2"
              role="list"
              aria-label="Menu items carousel"
            >
              {menu.map((m) => (
                <div
                  key={`${m.store}-${m.name}`}
                  role="listitem"
                  className="ss-imgzoom w-[236px] shrink-0 snap-start overflow-hidden rounded-2xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-[0_10px_28px_rgba(0,0,0,0.12)] sm:w-[260px]"
                >
                  <div className="relative aspect-video w-full overflow-hidden">
                    <Image src={m.img} alt={m.name} fill sizes="260px" className="object-cover" />
                  </div>
                  <div className="p-4">
                    {/* store badge chip */}
                    <p className="inline-flex items-center gap-1 rounded-full bg-[#F3EDDD] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#8a6d1f]">
                      <span aria-hidden>{STORE_EMOJI[m.store] ?? '🏷️'}</span> {m.store}
                    </p>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-bold">{m.name}</h3>
                        <p className="text-[15px] font-black tabular text-[#1A1A1A]"><span className="text-[#8a6d1f]">₹</span>{price(m.pricePaise).slice(1)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openDemo(m.name)}
                        className="inline-flex h-11 min-w-[64px] items-center justify-center rounded-xl border border-[#D4AF37] bg-transparent px-3 text-sm font-bold text-[#8a6d1f] transition-all hover:bg-[#D4AF37] hover:text-[#1A1A1A] active:scale-[0.98]"
                        aria-label={`Add ${m.name} — opens the demo`}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {/* "See Full Menu" as the last carousel card (dashed, per brief) */}
              <button
                type="button"
                onClick={() => openDemo()}
                disabled={!seatToken}
                role="listitem"
                aria-label="See full menu — opens the live demo"
                className="flex w-[236px] shrink-0 snap-start flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-[#D4AF37] text-[#8a6d1f] transition-colors hover:bg-[#D4AF37]/10 disabled:opacity-50 sm:w-[260px]"
              >
                <span className="text-[15px] font-bold">See Full Menu →</span>
                <span className="text-xs text-[#8B8B8B]">Every store · live demo</span>
              </button>
            </div>
            {/* pagination dots */}
            <div className="mt-4 flex items-center justify-center gap-2" role="tablist" aria-label="Menu carousel pages">
              {menu.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={dot === i}
                  aria-label={`Go to menu item ${i + 1}`}
                  onClick={() => goToCard(i)}
                  className={`h-2.5 rounded-full transition-all ${dot === i ? 'w-6 bg-[#D4AF37]' : 'w-2.5 bg-[#D8D3C8] hover:bg-[#C9C2B4]'}`}
                />
              ))}
            </div>
          </Reveal>
        </section>

        {/* ── trust stat cards ── */}
        <section aria-label="Trust and safety" className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6 sm:pb-24">
          <Reveal>
            <div className="grid gap-4 sm:grid-cols-3 sm:gap-6">
              {STATS.map((s) => (
                <div key={s.label} className="rounded-2xl bg-white p-6 text-center shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all hover:scale-[1.02] hover:shadow-[0_10px_28px_rgba(0,0,0,0.12)]">
                  <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#F3EDDD]">
                    <s.icon className="h-5.5 w-5.5 text-[#8a6d1f]" aria-hidden />
                  </span>
                  <p className="mt-3 text-[34px] font-black leading-none tracking-tight">{s.num}</p>
                  <h3 className="mt-2 text-[15px] font-bold">{s.label}</h3>
                  <p className="mt-1 text-sm leading-[1.5] text-[#8B8B8B]">{s.sub}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                { icon: BadgeCheck, text: 'Real cinema pilot at Aurora Mall, Mumbai — not a mockup.' },
                { icon: Rocket, text: 'Zero setup — no app, no sign-up. Scan and go.' },
                { icon: Lock, text: 'Card details never touch our servers — Razorpay handles payments.' },
              ].map((t) => (
                <div key={t.text} className="flex items-start gap-3">
                  <t.icon className="mt-0.5 h-5 w-5 shrink-0 text-[#8a6d1f]" aria-hidden />
                  <p className="text-sm leading-[1.6] text-[#6F6F6F]">{t.text}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ── social proof: right before FAQ ── */}
        <section aria-label="What users say" className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <Reveal>
            <h2 className="text-center text-[28px] font-bold tracking-tight sm:text-[36px]">What users say</h2>
            {/* overall rating badge */}
            <p className="mt-4 text-center text-[32px] font-black leading-none tracking-tight text-[#1A1A1A]">
              4.8 <Star className="mb-1 inline h-6 w-6 fill-[#D4AF37] text-[#D4AF37]" aria-hidden />
            </p>
            <p className="mt-1 text-center text-[14px] text-[#6F6F6F]">Out of 250+ reviews</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3 sm:gap-6">
              {REVIEWS.map((r) => (
                <figure key={r.name} className="rounded-2xl border border-[#EFEAE0] bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all hover:-translate-y-1 hover:shadow-[0_10px_28px_rgba(0,0,0,0.12)]">
                  <div className="flex items-center gap-0.5 text-[#D4AF37]" aria-label={`${r.stars} out of 5 stars`}>
                    {Array.from({ length: r.stars }).map((_, i) => <Star key={i} className="h-3.5 w-3.5 fill-current" aria-hidden />)}
                  </div>
                  <blockquote className="mt-3 text-[15px] font-medium leading-[1.6] text-[#1A1A1A]">&ldquo;{r.quote}&rdquo;</blockquote>
                  <figcaption className="mt-3 text-sm text-[#6F6F6F]">
                    — {r.name}, {r.place} <span className="text-xs text-[#8B8B8B]">· {r.when}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
            <p className="mt-4 text-center text-xs text-[#8B8B8B]">Pilot feedback from the Aurora Mall demo.</p>
          </Reveal>
        </section>

        {/* ── FAQ ── */}
        <section aria-label="Frequently asked questions" className="mx-auto max-w-2xl px-4 py-14 sm:px-6 sm:py-20">
          <Reveal>
            <h2 className="text-center text-[28px] font-bold tracking-tight sm:text-[36px]">Questions, answered</h2>
            <div className="mt-8">
              <FaqAccordion items={LANDING_FAQ} />
            </div>
            <p className="mt-4 text-center text-sm text-[#6F6F6F]">
              More questions? <a href="/faq" className="font-semibold text-[#8a6d1f] underline underline-offset-2">See the full FAQ</a>
            </p>
          </Reveal>
        </section>

      </main>

      {/* ── footer: Product / Legal / Access ── */}
      <footer className="mt-auto bg-[#141414] pb-[env(safe-area-inset-bottom)] text-stone-400">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 sm:grid-cols-4 sm:px-6">
          <div>
            <p className="flex items-center gap-1.5 text-[17px] font-extrabold text-white" aria-hidden>🍿 SeatServe</p>
            <p className="mt-2 max-w-[220px] text-sm leading-[1.6]">Snacks from every store, delivered to your cinema seat.</p>
          </div>
          <nav aria-label="Product">
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Product</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href="/scan" className="inline-flex min-h-[44px] items-center hover:text-[#D4AF37] hover:underline">Scan a seat QR</a></li>
              <li><a href="/faq" className="inline-flex min-h-[44px] items-center hover:text-[#D4AF37] hover:underline">FAQ</a></li>
              <li><a href="/#/track" className="inline-flex min-h-[44px] items-center gap-1 hover:text-[#D4AF37] hover:underline">Track an order <ArrowRight className="h-3 w-3" aria-hidden /></a></li>
            </ul>
          </nav>
          <nav aria-label="Legal">
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Legal</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href="/legal/privacy" className="inline-flex min-h-[44px] items-center hover:text-[#D4AF37] hover:underline">Privacy policy</a></li>
              <li><a href="/legal/terms" className="inline-flex min-h-[44px] items-center hover:text-[#D4AF37] hover:underline">Terms of use</a></li>
              <li><a href="/legal/refund" className="inline-flex min-h-[44px] items-center hover:text-[#D4AF37] hover:underline">Cancellation &amp; refund policy</a></li>
            </ul>
          </nav>
          <nav aria-label="Access">
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Access</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href="/staff" className="inline-flex min-h-[44px] items-center hover:text-[#D4AF37] hover:underline">Staff login</a></li>
              <li><a href="/developers" className="inline-flex min-h-[44px] items-center hover:text-[#D4AF37] hover:underline">Developers</a></li>
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
