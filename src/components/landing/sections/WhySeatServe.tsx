'use client'

/**
 * WhySeatServe — three proof cards + the waiting-line comparison.
 * Uses the CSS reveal system: the container arms `.ss-reveal` and the hook
 * releases `.ss-reveal-in`, which also triggers the self-drawing check mark
 * (`.ss-draw-check`) and the bar chart (`.ss-bar`) exactly on arrival.
 * Deliberately framer-free inside — the cards hold still so the small
 * animated details carry the section.
 */
import { Clock, Target, Wallet, Zap } from 'lucide-react'
import { useReveal } from '@/lib/motion/useReveal'

const STORE_DOTS = ['#D4AF37', '#C4552D', '#7A9E4F', '#8E5A79', '#8a6d1f']

const LINE_ITEMS = [
  '20-minute wait',
  'Standing in queue',
  "Can't watch the movie",
  'Stressful',
  'Miss opening scenes',
] as const

const SERVE_ITEMS = [
  '8-minute delivery',
  'Sitting in your seat',
  'Watch the movie',
  'Stress-free',
  'Real-time tracking',
] as const

export function WhySeatServe() {
  const reveal = useReveal<HTMLDivElement>()

  return (
    <section
      aria-label="Why SeatServe"
      className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20"
    >
      <div ref={reveal} className="ss-reveal">
        <h2 className="text-center text-[28px] font-bold tracking-tight sm:text-[36px]">
          Why SeatServe
        </h2>

        <div className="mt-10 grid gap-4 sm:grid-cols-3 sm:gap-6">
          <div className="benefit-card rounded-2xl bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-[0_10px_28px_rgba(0,0,0,0.12)]">
            <span className="text-[26px] font-black tracking-tight text-[#D4AF37]">
              8 min
            </span>
            <span className="mt-2 flex h-6 items-end gap-1" aria-hidden="true">
              <span className="ss-bar h-2 w-2 rounded-sm bg-[#EFEAE0]" style={{ animationDelay: '0s' }} />
              <span className="ss-bar h-3.5 w-2 rounded-sm bg-[#EFEAE0]" style={{ animationDelay: '0.1s' }} />
              <span className="ss-bar h-5 w-2 rounded-sm bg-[#EFEAE0]" style={{ animationDelay: '0.2s' }} />
              <span className="ss-bar h-6 w-2 rounded-sm bg-[#D4AF37]" style={{ animationDelay: '0.3s' }} />
              <Clock className="ml-1 h-4 w-4 text-[#8a6d1f]" aria-hidden />
            </span>
            <div className="mt-3 flex items-center gap-2">
              <Zap className="h-5 w-5 text-[#8a6d1f]" aria-hidden />
              <h3 className="text-base font-bold">Faster than the line</h3>
            </div>
            <p className="mt-1 text-sm leading-[1.6] text-[#6F6F6F]">
              Food in ~8 minutes, not 20
            </p>
          </div>

          <div className="benefit-card rounded-2xl bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-[0_10px_28px_rgba(0,0,0,0.12)]">
            <span className="text-[26px] font-black tracking-tight text-[#D4AF37]">
              5 stores
            </span>
            <span className="mt-2 flex items-center gap-1.5" aria-hidden="true">
              {STORE_DOTS.map((color) => (
                <span
                  key={color}
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: color }}
                />
              ))}
              <span className="ml-1 text-[11px] font-bold uppercase tracking-wider text-[#8B8B8B]">
                Aurora pilot
              </span>
            </span>
            <div className="mt-3 flex items-center gap-2">
              <Target className="h-5 w-5 text-[#8a6d1f]" aria-hidden />
              <h3 className="text-base font-bold">Order from any store</h3>
            </div>
            <p className="mt-1 text-sm leading-[1.6] text-[#6F6F6F]">
              Pizza, popcorn &amp; chai in one order
            </p>
          </div>

          <div className="benefit-card rounded-2xl bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-[0_10px_28px_rgba(0,0,0,0.12)]">
            <span className="text-[26px] font-black tracking-tight text-[#D4AF37]">
              1 tap
            </span>
            <span className="mt-2 flex items-center gap-1.5" aria-hidden="true">
              <svg className="ss-draw-check h-6 w-6" viewBox="0 0 32 32" fill="none">
                <circle className="ss-draw-circle" cx="16" cy="16" r="14" stroke="#D4AF37" strokeWidth="2.5" />
                <path className="ss-draw-path" d="M10 16.5L14.5 21L22 11.5" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#8B8B8B]">
                paid once
              </span>
            </span>
            <div className="mt-3 flex items-center gap-2">
              <Wallet className="h-5 w-5 text-[#8a6d1f]" aria-hidden />
              <h3 className="text-base font-bold">One payment</h3>
            </div>
            <p className="mt-1 text-sm leading-[1.6] text-[#6F6F6F]">
              Split across stores automatically
            </p>
          </div>
        </div>

        <h3 className="mt-12 text-center text-[24px] font-bold tracking-tight">
          The SeatServe Difference
        </h3>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 sm:gap-5">
          <div className="rounded-2xl border border-[#C41E3C]/15 bg-[#C41E3C]/[0.05] p-6">
            <p className="text-sm font-extrabold uppercase tracking-wider text-[#C41E3C]">
              ⏳ ❌ Waiting in Line
            </p>
            <ul className="mt-3 space-y-2">
              {LINE_ITEMS.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-[14px] leading-[1.5] text-[#505050]"
                >
                  <span
                    className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#C41E3C]/50"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-[#D4AF37]/40 bg-[#D4AF37]/[0.1] p-6 shadow-[0_4px_12px_rgba(212,175,55,0.14)]">
            <p className="text-sm font-extrabold uppercase tracking-wider text-[#8a6d1f]">
              ⚡ ✅ SeatServe Order
            </p>
            <ul className="mt-3 space-y-2">
              {SERVE_ITEMS.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-[14px] font-medium leading-[1.5] text-[#9F7D2B]"
                >
                  <span
                    className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#D4AF37]"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
