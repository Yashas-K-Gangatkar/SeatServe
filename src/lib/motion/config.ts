/**
 * NotiFetch — central motion system configuration.
 *
 * Every landing animation (framer-motion variants, sound cue timing, loop
 * periods) derives its numbers from here. No magic durations or easings
 * scattered across components.
 *
 * The easings intentionally mirror the site's existing CSS vocabulary
 * (globals.css `.ss-*` layer) so CSS-driven and JS-driven motion feel like
 * one system:
 *   EASE.out     = cubic-bezier(.16, 1, .3, 1)    → .ss-rise
 *   EASE.soft    = cubic-bezier(.22, 1, .36, 1)    → .ss-notif
 *   EASE.springy = cubic-bezier(.34, 1.56, .64, 1) → .ss-reveal
 *   EASE.snap    = cubic-bezier(.2, .8, .3, 1)     → .ss-pop
 */

export const EASE = {
  out: [0.16, 1, 0.3, 1],
  soft: [0.22, 1, 0.36, 1],
  springy: [0.34, 1.56, 0.64, 1],
  snap: [0.2, 0.8, 0.3, 1],
  run: [0.45, 0, 0.55, 1],
} as const

export const DUR = {
  xs: 0.22,
  sm: 0.45,
  md: 0.7,
  lg: 1.0,
  hero: 1.2,
} as const

/** Spring presets (framer-motion `type: 'spring'`). */
export const SPRING = {
  /** subtle UI physics — buttons, chips */
  gentle: { type: 'spring', stiffness: 260, damping: 26, mass: 0.9 },
  /** card arrivals — a touch more life */
  arrive: { type: 'spring', stiffness: 210, damping: 20, mass: 1 },
  /** press release — quick settle */
  release: { type: 'spring', stiffness: 380, damping: 24, mass: 0.7 },
} as const

/** Stagger cadence between siblings (seconds). */
export const STAGGER = {
  tight: 0.05,
  base: 0.09,
  loose: 0.14,
} as const

/** Loop periods — kept in one place so loops share clocks and stay seamless. */
export const LOOP = {
  /** notification card cycle in the phone (must cover enter→hold→exit) */
  notif: 5.5,
  /** master scene clock for the 6s family (check-pop, run, bell, bars…) */
  master: 6,
  /** hero media breathing zoom */
  heroZoom: 8,
  /** auto-advance cadence of the hero step carousel */
  carouselStep: 3.4,
} as const

/**
 * Hero entrance choreography — phase start times (seconds) after mount.
 * The sequence tells the product story in miniature:
 * place → brand → promise → action → proof → live system.
 * Values are intentional: each layer lands before the next starts moving,
 * and the deltas shrink as the scene approaches equilibrium.
 */
export const HERO_TIMELINE = {
  badge: 0,
  headline: 0.08,
  subline: 0.2,
  cta: 0.36,
  trust: 0.5,
  media: 0.66,
  liveSystem: 1.05,
  settled: 1.7,
} as const

/** Sound cue names — one string vocabulary shared by components + SoundManager. */
export type SoundName =
  | 'tap' // small UI press
  | 'pop' // card / chip arrival
  | 'notif' // notification lands (the product's signature cue)
  | 'sweep' // section transition / carousel step
  | 'success' // action confirmed
  | 'connect' // data link completed
  | 'toggle' // sound switch itself

/** Device performance/motion tier — drives animation complexity. */
export type MotionTier = 'full' | 'reduced'

export function resolveMotionTier(): MotionTier {
  if (typeof window === 'undefined') return 'full'
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'reduced'
    : 'full'
}

/** Viewport breakpoints used by the landing (mirrors Tailwind defaults). */
export const BP = { sm: 640, md: 768, lg: 1024 } as const
