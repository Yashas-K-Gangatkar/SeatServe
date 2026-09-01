'use client'

/**
 * TrustStats — 500+ / 8 min / 100% count up once when they enter view.
 * The count-up is the "live data" feel with a purpose: these ARE the
 * pilot's numbers. Tabular figures keep the layout rock-steady while the
 * digits roll. A single quiet connect-cue marks completion (sound on only).
 * Trust badges below stay static — the contrast keeps the stat moment special.
 */
import { useEffect, useRef, useState } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { EASE, DUR } from '@/lib/motion/config'
import { fadeUp, stagger } from '@/lib/motion/variants'
import { useSound } from '@/lib/sound/SoundProvider'

type Stat = { value: number; suffix: string; label: string; blurb: string }

const STATS: Stat[] = [
  {
    value: 500,
    suffix: '+',
    label: 'Orders Delivered',
    blurb: 'Served across the Aurora pilot',
  },
  {
    value: 8,
    suffix: ' min',
    label: 'Average Delivery',
    blurb: 'From kitchen fire to seat B-row',
  },
  {
    value: 100,
    suffix: '%',
    label: 'Secure & Verified',
    blurb: 'Bank-grade gateway · demo never charges',
  },
]

const TRUST = [
  'Real cinema pilot at Aurora Mall, Mumbai — not a mockup.',
  'Zero setup — no app, no sign-up. Scan and go.',
  'Card details never touch our servers — Razorpay handles payments.',
]

/** rAF count-up: ease-out cubic, ~1.1s. Reduced motion skips the loop entirely. */
function useCountUp(target: number, start: boolean, reduced: boolean): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!start || reduced) return
    let raf = 0
    const t0 = performance.now()
    const dur = 1100
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [start, target, reduced])
  return start && reduced ? target : value
}

function StatCard({ stat, start }: { stat: Stat; start: boolean }) {
  const reduced = useReducedMotion()
  const value = useCountUp(stat.value, start, reduced ?? false)
  return (
    <motion.div variants={fadeUp} className="rounded-2xl bg-white p-6 text-center shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
      <p className="tabular text-[32px] font-black leading-none tracking-tight text-[#1A1A1A]">
        {value}
        <span className="text-[#D4AF37]">{stat.suffix}</span>
      </p>
      <h3 className="mt-2 text-base font-bold">{stat.label}</h3>
      <p className="mt-1 text-sm text-[#6F6F6F]">{stat.blurb}</p>
    </motion.div>
  )
}

export function TrustStats() {
  const gridRef = useRef<HTMLDivElement | null>(null)
  const inView = useInView(gridRef, { once: true, margin: '0px 0px -15% 0px' })
  const { play } = useSound()
  const firedRef = useRef(false)

  useEffect(() => {
    if (inView && !firedRef.current) {
      firedRef.current = true
      const t = window.setTimeout(
        () => play('connect', 0.6),
        (DUR.lg + 0.2) * 1000,
      )
      return () => window.clearTimeout(t)
    }
  }, [inView, play])

  return (
    <section aria-label="Pilot statistics" className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
      <motion.div
        ref={gridRef}
        initial="hidden"
        animate={inView ? 'show' : 'hidden'}
        variants={stagger()}
        className="grid gap-4 sm:grid-cols-3 sm:gap-6"
      >
        {STATS.map((stat) => (
          <StatCard key={stat.label} stat={stat} start={inView} />
        ))}
      </motion.div>

      <motion.ul
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        variants={stagger(0.08, 0.3)}
        className="mt-6 space-y-2 text-center"
      >
        {TRUST.map((line) => (
          <motion.li
            key={line}
            variants={{
              hidden: { opacity: 0 },
              show: { opacity: 1, transition: { duration: DUR.sm, ease: EASE.out } },
            }}
            className="text-[13px] text-[#8B8B8B]"
          >
            {line}
          </motion.li>
        ))}
      </motion.ul>
    </section>
  )
}
