'use client'

/**
 * NotiFetch hero — the product story, choreographed.
 *
 * Entrance (8 deliberate phases, HERO_TIMELINE):
 *   place → headline → promise → actions → proof → product scene → live
 *   system wakes → equilibrium (loops continue, nothing else moves).
 *
 * Live system: the phone walks a 5-step conveyor (scan → browse → pay →
 * track → arrived) on a fixed cadence. Transitions always travel the same
 * direction, and step 5 hands off to step 1 with the identical motion, so
 * the loop boundary is invisible. A status chip beside the phone narrates
 * each step — the notification→intelligence→action story in miniature.
 *
 * Performance: the conveyor advances with low-frequency state (3.4s), all
 * movement is transform/opacity, the breathing zoom is a pure-CSS infinite
 * loop, and the whole carousel pauses off-screen and in hidden tabs.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from 'framer-motion'
import { MapPin, RefreshCw, ScanLine, Signal, Wifi, BatteryFull } from 'lucide-react'
import { HERO_TIMELINE, LOOP, SPRING, DUR, EASE } from '@/lib/motion/config'
import { blurRise, fadeRise, maskUp } from '@/lib/motion/variants'
import { useSound } from '@/lib/sound/SoundProvider'
import { HERO_STEPS, StepPanel } from './StepPanels'

const STEP_COUNT = HERO_STEPS.length

/** Panel conveyor — one direction only; 5→1 is the same move as 4→5. */
const panelVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: 24 * dir }),
  center: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.38, ease: EASE.soft },
  },
  exit: {
    opacity: 0,
    x: -24,
    transition: { duration: 0.3, ease: EASE.snap },
  },
}

/** Status chip narration beside the phone. */
const chipVariants: Variants = {
  enter: { opacity: 0, y: 10, scale: 0.94 },
  center: { opacity: 1, y: 0, scale: 1, transition: SPRING.arrive },
  exit: { opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.22, ease: EASE.snap } },
}

export function Hero({ demoSeatHref }: { demoSeatHref: string | null }) {
  const [step, setStep] = useState(0)
  const [liveSystemOn, setLiveSystemOn] = useState(false)
  const reduced = useReducedMotion()
  const { play } = useSound()

  const sectionRef = useRef<HTMLElement | null>(null)
  const visibleRef = useRef(true)
  const timerRef = useRef<number | null>(null)

  // wake the live system after the entrance settles (phase 7)
  useEffect(() => {
    const t = window.setTimeout(
      () => setLiveSystemOn(true),
      HERO_TIMELINE.liveSystem * 1000,
    )
    return () => window.clearTimeout(t)
  }, [])

  const goTo = useCallback(
    (next: number, via: 'auto' | 'tap') => {
      setStep((prev) => {
        const nextIdx = ((next % STEP_COUNT) + STEP_COUNT) % STEP_COUNT
        if (nextIdx !== prev) {
          if (via === 'tap') play('sweep', 0.7)
          else if (nextIdx === STEP_COUNT - 1) play('notif')
          else play('sweep', 0.7)
        }
        return nextIdx
      })
    },
    [play],
  )

  // conveyor clock — paused off-screen / hidden tab / reduced-motion keeps
  // the cadence but the transitions degrade to opacity-only via variants
  useEffect(() => {
    if (!liveSystemOn) return
    const advance = () => {
      if (visibleRef.current && !document.hidden) {
        setStep((prev) => (prev + 1) % STEP_COUNT)
        play('sweep', 0.55)
      }
    }
    timerRef.current = window.setInterval(advance, LOOP.carouselStep * 1000)
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
  }, [liveSystemOn, play])

  // hero visibility gate (no work when the user has scrolled past)
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting
      },
      { threshold: 0.25 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const captionId = 'hero-step-caption'

  return (
    <section
      ref={sectionRef}
      aria-label="SeatServe — snacks at your seat"
      className="mx-auto max-w-5xl overflow-hidden px-4 pb-14 pt-12 text-center sm:px-6 sm:pb-20 sm:pt-20"
    >
      {/* phase 1 — the place establishes the scene */}
      <motion.p
        initial="hidden"
        animate="show"
        custom={HERO_TIMELINE.badge}
        variants={{
          hidden: { opacity: 0, y: 10 },
          show: (d: number) => ({
            opacity: 1,
            y: 0,
            transition: { duration: DUR.sm, ease: EASE.out, delay: d },
          }),
        }}
        className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-[#D4AF37]/70 bg-[#FAF8F5] px-4 py-2 text-[13px] font-bold shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
      >
        <MapPin className="h-4 w-4 text-[#8a6d1f]" aria-hidden />
        Aurora Mall, Mumbai
      </motion.p>

      {/* phase 2 — the promise (single high-impact blur entrance) */}
      <motion.h1
        initial="hidden"
        animate="show"
        variants={blurRise}
        transition={{ duration: DUR.md, ease: EASE.out, delay: HERO_TIMELINE.headline }}
        className="mx-auto mt-6 max-w-3xl text-[40px] font-bold leading-[1.05] tracking-tight sm:text-[56px]"
      >
        Snacks at Your Seat
      </motion.h1>

      {/* phase 3 — supporting copy */}
      <motion.p
        initial="hidden"
        animate="show"
        variants={fadeRise}
        transition={{ duration: DUR.md, ease: EASE.out, delay: HERO_TIMELINE.subline }}
        className="mx-auto mt-4 max-w-xl text-2xl font-medium leading-snug tracking-tight text-[#57534E] sm:text-[28px]"
      >
        Scan QR. Order. Delivered.
      </motion.p>

      {/* phase 4 — actions */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.08, delayChildren: HERO_TIMELINE.cta } },
        }}
        className="mx-auto mt-8 flex w-full max-w-xs flex-col items-center gap-3 sm:max-w-none sm:flex-row sm:justify-center"
      >
        <motion.a
          variants={fadeRise}
          href="/scan"
          onClick={() => play('tap')}
          className="inline-flex h-12 w-full items-center justify-center rounded-xl px-8 text-[15px] font-bold shadow-[0_4px_12px_rgba(212,175,55,0.35)] transition-all hover:scale-[1.02] hover:shadow-[0_8px_20px_rgba(212,175,55,0.45)] active:scale-[0.98] sm:w-[210px] bg-[#D4AF37] text-[#1A1A1A] hover:bg-[#C39B2A]"
        >
          <ScanLine className="mr-2 h-4.5 w-4.5" aria-hidden />
          Scan QR Code
        </motion.a>
        <motion.button
          variants={fadeRise}
          type="button"
          disabled={!demoSeatHref}
          onClick={() => {
            play('tap')
            if (demoSeatHref) window.location.hash = demoSeatHref
          }}
          className="inline-flex h-12 w-full items-center justify-center rounded-xl border-2 border-[#D4AF37] bg-transparent px-8 text-[15px] font-semibold text-[#8a6d1f] transition-all hover:border-[#C99F2E] hover:bg-[#D4AF37]/10 hover:text-[#C99F2E] active:scale-[0.98] disabled:opacity-50 sm:w-[170px]"
        >
          Try Demo
        </motion.button>
      </motion.div>

      {/* phase 5 — proof chip */}
      <motion.p
        initial="hidden"
        animate="show"
        variants={fadeRise}
        transition={{ duration: DUR.md, ease: EASE.out, delay: HERO_TIMELINE.trust }}
        className="group mx-auto mt-4 inline-flex w-fit items-center gap-1.5 rounded-lg bg-[#D4AF37]/10 px-3 py-1.5 text-[13px] font-bold text-[#8a6d1f]"
      >
        <RefreshCw
          className="h-3.5 w-3.5 transition-transform duration-1000 group-hover:rotate-[360deg]"
          aria-hidden
        />
        Fresh demo data · Try now — 100% risk-free, no real charges
      </motion.p>

      {/* phase 6 — the product scene, masked reveal + depth layers */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={maskUp}
        transition={{ duration: DUR.lg, ease: EASE.out, delay: HERO_TIMELINE.media }}
        className="mx-auto mt-12 max-w-2xl"
      >
        <div className="nf-breathe">
          <div className="relative aspect-square w-full overflow-hidden rounded-[2rem] shadow-[0_24px_60px_rgba(0,0,0,0.18)] sm:aspect-[16/10]">
            <img
              alt="Cinema auditorium with warm lighting"
              src="/landing/cinema.png"
              loading="eager"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/40" />

            {/* depth layer — the phone, arriving slightly after the frame */}
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.92 }}
              animate={
                reduced
                  ? { opacity: 1, y: 0, scale: 1 }
                  : { opacity: 1, y: 0, scale: 1 }
              }
              transition={{
                duration: DUR.lg,
                ease: EASE.out,
                delay: HERO_TIMELINE.media + 0.3,
              }}
              className="absolute left-1/2 top-1/2 w-[44%] max-w-[220px] min-w-[170px] -translate-x-1/2 -translate-y-1/2"
            >
              <motion.div
                animate={{ y: reduced ? 0 : [0, -5, 0] }}
                transition={{
                  duration: LOOP.master,
                  ease: 'easeInOut',
                  repeat: Infinity,
                  times: [0, 0.5, 1],
                }}
                className="relative aspect-[9/17] overflow-hidden rounded-[1.6rem] border-[5px] border-stone-900 bg-white shadow-2xl"
              >
                {/* status bar */}
                <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 pt-1.5 text-[8px] font-semibold text-stone-800">
                  <span className="tabular">9:41</span>
                  <span className="flex items-center gap-0.5">
                    <Signal className="h-2 w-2" aria-hidden />
                    <Wifi className="h-2 w-2" aria-hidden />
                    <BatteryFull className="h-2.5 w-2.5" aria-hidden />
                  </span>
                </div>

                {/* step conveyor — always one direction; 5→1 identical to 4→5 */}
                <AnimatePresence initial={false} custom={1}>
                  <motion.div
                    key={step}
                    custom={1}
                    variants={panelVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="h-full w-full"
                    role="img"
                    aria-label={`Demo step: ${HERO_STEPS[step].label}`}
                  >
                    <StepPanel step={step} />
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            </motion.div>
          </div>
        </div>

        {/* live narration: caption + dots + status chip */}
        <div className="mt-4 flex flex-col items-center gap-2.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-[#1A1A1A]" aria-live="polite" id={captionId}>
              {HERO_STEPS[step].caption}
            </p>
          </div>
          <div className="flex gap-1.5" role="tablist" aria-label="Demo steps">
            {HERO_STEPS.map((s, i) => (
              <button
                key={s.caption}
                type="button"
                role="tab"
                aria-selected={step === i}
                aria-label={`Show step ${i + 1}: ${s.label}`}
                onClick={() => {
                  setStep(i)
                  play('sweep', 0.7)
                }}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  step === i
                    ? 'w-6 bg-[#D4AF37]'
                    : 'w-1.5 bg-[#D8D3C8] hover:bg-[#C8C2B4]'
                }`}
              />
            ))}
          </div>
          {/* the live system chip — appears once the entrance has settled */}
          <div className="flex h-6 items-center" aria-hidden>
            <AnimatePresence mode="wait" initial={false}>
              {liveSystemOn && (
                <motion.span
                  key={step}
                  variants={chipVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="inline-flex items-center gap-1 rounded-full bg-[#D4AF37]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#8a6d1f]"
                >
                  {HERO_STEPS[step].chip}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </section>
  )
}
