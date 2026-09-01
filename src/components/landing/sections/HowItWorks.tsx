'use client'

/**
 * HowItWorks — four steps, tap to watch each one happen.
 * Tap-driven by design (the hero conveyor is the auto-playing story; this
 * panel is the hands-on explainer). Every step panel is built from the same
 * 6s CSS loop family, so whichever step is showing, it breathes in time
 * with the rest of the page.
 */
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ScanLine, UtensilsCrossed, Wallet, BellRing, Check } from 'lucide-react'
import { EASE } from '@/lib/motion/config'
import { useSound } from '@/lib/sound/SoundProvider'
import { useReveal } from '@/lib/motion/useReveal'

const STEPS = [
  { id: 'scan', icon: ScanLine, title: 'Scan', blurb: 'Point at the QR on your seat' },
  { id: 'browse', icon: UtensilsCrossed, title: 'Browse', blurb: 'Every store in one cart' },
  { id: 'pay', icon: Wallet, title: 'Pay', blurb: 'One tap. UPI or card.' },
  { id: 'track', icon: BellRing, title: 'Track', blurb: 'Watch it reach your seat' },
] as const

type StepId = (typeof STEPS)[number]['id']

function PanelVisual({ step }: { step: StepId }) {
  if (step === 'scan') {
    return (
      <div className="flex items-center gap-5">
        <div className="relative h-40 w-24 shrink-0 rounded-[1.4rem] border-[5px] border-[#1A1A1A] bg-white">
          <div className="absolute inset-2 grid grid-cols-3 place-content-center gap-1" aria-hidden="true">
            {Array.from({ length: 9 }).map((_, i) => (
              <span
                key={i}
                className={`h-2.5 w-2.5 rounded-[2px] ${i % 2 === 1 ? 'bg-[#1A1A1A]' : 'bg-[#D8D3C8]'}`}
              />
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

  if (step === 'browse') {
    return (
      <div className="flex items-center gap-5">
        <div className="flex h-40 w-24 shrink-0 flex-col justify-center gap-2 rounded-[1.4rem] border-[5px] border-[#1A1A1A] bg-white p-2">
          {[0.1, 0.2, 0.3].map((d, i) => (
            <span
              key={i}
              className="ss-bar h-6 rounded-md bg-[#F3EDDD]"
              style={{ animationDelay: `${d}s` }}
            />
          ))}
        </div>
        <div className="relative">
          <span className="ss-check-pop flex h-12 w-12 items-center justify-center rounded-full bg-[#D4AF37] text-lg text-white shadow-lg" aria-hidden>
            🍿
          </span>
          <p className="mt-2 text-sm font-bold">3 stores · 1 cart</p>
          <p className="text-xs text-[#6F6F6F]">₹630 in one checkout</p>
        </div>
      </div>
    )
  }

  if (step === 'pay') {
    return (
      <div className="flex items-center gap-5">
        <div className="flex h-40 w-24 shrink-0 flex-col items-center justify-center gap-2 rounded-[1.4rem] border-[5px] border-[#1A1A1A] bg-white p-2">
          <span className="tabular text-sm font-black text-[#1A1A1A]">₹630</span>
          <span className="ss-pay-tap inline-flex items-center justify-center rounded-lg bg-[#D4AF37] px-2 py-1.5 text-[9px] font-black text-[#1A1A1A]">
            Pay via UPI
          </span>
          <span className="text-[8px] text-[#8B8B8B]">Razorpay · demo</span>
        </div>
        <div className="relative">
          <span className="ss-check-pop flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg">
            <Check className="h-6 w-6" aria-hidden />
          </span>
          <p className="mt-2 text-sm font-bold">Paid once</p>
          <p className="text-xs text-[#6F6F6F]">Split to 3 kitchens automatically</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-5">
      <div className="relative h-40 w-24 shrink-0 rounded-[1.4rem] border-[5px] border-[#1A1A1A] bg-white">
        <div className="absolute inset-x-3 top-1/2 -translate-y-1/2">
          <div className="relative h-1.5 rounded-full bg-[#EFEAE0]" aria-hidden>
            <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-[#D4AF37]" />
            <span className="ss-run absolute top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[10px] shadow-md">
              🛵
            </span>
          </div>
        </div>
        <span className="ss-bell absolute bottom-2 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-[#F3EDDD] text-sm" aria-hidden>
          🔔
        </span>
      </div>
      <div className="relative">
        <span className="ss-check-pop flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg">
          <Check className="h-6 w-6" aria-hidden />
        </span>
        <p className="mt-2 text-sm font-bold">Out for delivery</p>
        <p className="text-xs text-[#6F6F6F]">Row D · about 2 minutes</p>
      </div>
    </div>
  )
}

export function HowItWorks() {
  const [active, setActive] = useState<StepId>('scan')
  const { play } = useSound()
  const reveal = useReveal<HTMLDivElement>()
  const activeStep = STEPS.find((s) => s.id === active) ?? STEPS[0]

  return (
    <section
      aria-label="How it works"
      className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20"
    >
      <div ref={reveal} className="ss-reveal">
        <h2 className="text-center text-[28px] font-bold tracking-tight sm:text-[36px]">
          How it works
        </h2>
        <p className="mt-3 text-center text-base text-[#6F6F6F]">
          Tap a step to watch it happen.
        </p>

        <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4 sm:gap-6">
          {STEPS.map((step) => {
            const selected = active === step.id
            const Icon = step.icon
            return (
              <button
                key={step.id}
                type="button"
                aria-expanded={selected}
                onClick={() => {
                  setActive(step.id)
                  play('sweep', 0.7)
                }}
                className={`flex min-h-[44px] flex-col items-center rounded-2xl p-3 text-center transition-all active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37] ${
                  selected
                    ? 'bg-[#F3EDDD] shadow-[0_4px_12px_rgba(212,175,55,0.18)]'
                    : 'hover:bg-[#F7F3E9]'
                }`}
              >
                <span
                  className={`flex h-16 w-16 items-center justify-center rounded-2xl transition-colors ${
                    selected ? 'bg-[#D4AF37]' : 'bg-[#F3EDDD]'
                  }`}
                >
                  <Icon
                    className={`h-8 w-8 ${selected ? 'text-[#1A1A1A]' : 'text-[#8a6d1f]'}`}
                    aria-hidden
                  />
                </span>
                <h3 className="mt-4 text-base font-bold">{step.title}</h3>
                <p className="mt-1 max-w-[180px] text-sm leading-snug text-[#6F6F6F]">
                  {step.blurb}
                </p>
              </button>
            )
          })}
        </div>

        <div
          role="img"
          aria-label={`Animation showing step ${activeStep.title}`}
          className="mx-auto mt-8 flex min-h-[190px] max-w-xl items-center justify-center gap-6 rounded-2xl border border-[#EFEAE0] bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.32, ease: EASE.soft }}
            >
              <PanelVisual step={active} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}
