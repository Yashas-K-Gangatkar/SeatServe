'use client'

/**
 * LiveStatus — "You'll know the second it's ready."
 *
 * The phone runs a pure-CSS notification conveyor on one shared 5.5s clock:
 * three cards (confirmed → in the oven → runner on the way) with negative
 * animation-delays so exactly one card is always landing while another lifts
 * away. The sequence is *cyclical by meaning* — "order confirmed" following
 * "on the way" reads as the next customer's order, so the loop boundary is
 * invisible and the scene never snaps.
 *
 * Sound: a quiet notification ping locks to the CSS loop's `animationiteration`
 * event — a cue per real loop turn, only while the section is on screen and
 * the tab is visible. No timers, no React re-renders.
 */
import { useEffect, useRef } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { fadeUp, stagger } from '@/lib/motion/variants'
import { useSound } from '@/lib/sound/SoundProvider'

const FEED = [
  {
    id: 'confirmed',
    emoji: '🍕',
    app: 'Pizza Corner',
    title: 'Order confirmed',
    body: 'Placing your order with the kitchen…',
    chip: 'just now',
    chipClass: 'bg-[#F3EDDD] text-[#8a6d1f]',
    delay: '0s',
  },
  {
    id: 'cooking',
    emoji: '👨‍🍳',
    app: 'Pizza Corner',
    title: 'Your pizza is in the oven',
    body: 'Tracking started · about 8 minutes',
    chip: 'on schedule',
    chipClass: 'bg-sky-100 text-sky-700',
    delay: '-1.83s',
  },
  {
    id: 'running',
    emoji: '🛵',
    app: 'Cinema Snacks',
    title: 'Popcorn ready — runner on the way',
    body: 'Seat B7 · two stops away',
    chip: '⚡ on time',
    chipClass: 'bg-emerald-100 text-emerald-700',
    delay: '-3.67s',
  },
] as const

export function LiveStatus() {
  const { play } = useSound()
  const reduced = useReducedMotion()
  const inViewRef = useRef(false)
  const stackRef = useRef<HTMLDivElement | null>(null)

  // scroll-linked counter-drift (desktop, motion allowed) — the phone and the
  // copy move a few pixels against each other: depth without gimmicks
  const sectionRef = useRef<HTMLElement | null>(null)
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  })
  const phoneDrift = useTransform(scrollYProgress, [0, 1], [10, -10])
  const copyDrift = useTransform(scrollYProgress, [0, 1], [-6, 6])

  // the feed only cues while it is actually on screen
  useEffect(() => {
    const el = stackRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        inViewRef.current = entry.isIntersecting && !document.hidden
      },
      { threshold: 0.3 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // pause the feed's cue when the tab is hidden
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) inViewRef.current = false
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  return (
    <section
      ref={sectionRef}
      aria-label="Live notification"
      className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20"
    >
      <div className="grid items-center gap-10 sm:grid-cols-2">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '0px 0px -12% 0px' }}
          variants={stagger()}
          className="order-2 sm:order-1"
          style={reduced ? undefined : { y: phoneDrift }}
        >
          <motion.div variants={fadeUp}>
            <div className="mx-auto w-[300px] rounded-[2.6rem] border-[10px] border-black/90 bg-[#0B0B0F] shadow-2xl">
              <div className="relative overflow-hidden rounded-[2rem] px-3 pb-5 pt-2.5">
                <div className="flex items-center justify-between px-2 text-[11px] font-semibold text-white/90">
                  <span className="tabular">9:41</span>
                  <span className="flex items-center gap-1" aria-hidden="true">
                    <span className="inline-block h-1.5 w-3 rounded-sm bg-white/90" />
                    <span className="inline-block h-2.5 w-5 rounded-[3px] border border-white/90">
                      <span className="block h-full w-3/4 rounded-sm bg-white/90" />
                    </span>
                  </span>
                </div>

                {/* notification conveyor — 3 cards, one shared clock */}
                <div
                  ref={stackRef}
                  className="relative mt-3 h-[132px]"
                  aria-live="polite"
                  aria-label="Live order updates demo"
                  onAnimationIteration={(e) => {
                    // event-locked cue: one ping per real loop turn
                    if (
                      e.animationName === 'ss-notif' &&
                      inViewRef.current &&
                      !document.hidden
                    ) {
                      play('notif', 0.5)
                    }
                  }}
                >
                  {FEED.map((card) => (
                    <div
                      key={card.id}
                      className="ss-notif absolute inset-x-0 top-0 rounded-2xl bg-white p-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
                      style={{ animationDelay: card.delay }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#D4AF37] text-base"
                          aria-hidden
                        >
                          {card.emoji}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#8B8B8B]">
                            <span>{card.app}</span>
                            <span className="font-semibold normal-case tracking-normal">
                              {card.chip}
                            </span>
                          </p>
                          <p className="mt-0.5 truncate text-[14px] font-bold leading-tight text-[#1A1A1A]">
                            {card.title}
                          </p>
                        </div>
                      </div>
                      <p className="mt-1.5 text-[13px] leading-snug text-[#3F3F3F]">
                        {card.body}
                      </p>
                      <span
                        className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold ${card.chipClass}`}
                      >
                        Seat B7 · live status
                      </span>
                    </div>
                  ))}
                </div>

                <div
                  className="mx-auto mt-4 h-1 w-24 rounded-full bg-white/40"
                  aria-hidden
                />
              </div>
            </div>
            <p className="mt-4 text-center text-[13px] text-[#8B8B8B]">
              Live push, every step — kitchens, runner, arrival.
            </p>
          </motion.div>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '0px 0px -12% 0px' }}
          variants={stagger(0.12)}
          className="order-1 sm:order-2"
          style={reduced ? undefined : { y: copyDrift }}
        >
          <motion.h2
            variants={fadeUp}
            className="text-[28px] font-bold leading-tight tracking-tight sm:text-[36px]"
          >
            You’ll know the second it’s ready.
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mt-3 max-w-md text-base leading-[1.6] text-[#6F6F6F]"
          >
            Live status for every store lands straight on your phone — from
            kitchen fire to runner at your row.
          </motion.p>
        </motion.div>
      </div>
    </section>
  )
}
