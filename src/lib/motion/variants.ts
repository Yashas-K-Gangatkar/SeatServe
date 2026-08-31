/**
 * NotiFetch — shared motion vocabulary (framer-motion variants).
 *
 * Components MUST compose these instead of writing inline transition objects,
 * so pacing stays coherent across the whole page. Anything unique enough to
 * live in a component should still reference EASE/DUR/SPRING from config.
 */
import type { Target, Transition, Variants } from 'framer-motion'
import { DUR, EASE, SPRING, STAGGER } from './config'

/** Mirrors the site's signature `.ss-rise` entrance. */
export const fadeRise: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DUR.md, ease: EASE.out },
  },
}

/** Larger section-level entrance. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DUR.md, ease: EASE.out },
  },
}

/** High-impact moment only (hero headline): rise + de-blur. Blur is short and
 *  cheap on a single element — never used on lists. */
export const blurRise: Variants = {
  hidden: { opacity: 0, y: 18, filter: 'blur(8px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: DUR.md, ease: EASE.out },
  },
}

/** Card / chip arrival with a whisper of scale. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.94, y: 10 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: SPRING.arrive,
  },
}

/** Product imagery — masked reveal (clip-path is GPU-composited in modern engines). */
export const maskUp: Variants = {
  hidden: { opacity: 0, clipPath: 'inset(12% 6% 12% 6% round 2rem)', scale: 0.985 },
  show: {
    opacity: 1,
    clipPath: 'inset(0% 0% 0% 0% round 2rem)',
    scale: 1,
    transition: { duration: DUR.lg, ease: EASE.out },
  },
}

/** Stagger container factory. */
export function stagger(
  cadence: number = STAGGER.base,
  delayChildren = 0,
): Variants {
  return {
    hidden: {},
    show: {
      transition: { staggerChildren: cadence, delayChildren },
    },
  }
}

/** Exit — quick, quiet, downward drift (used by AnimatePresence loops). */
export const quietExit: Variants = {
  exit: {
    opacity: 0,
    y: -12,
    scale: 0.98,
    transition: { duration: DUR.xs + 0.08, ease: EASE.snap },
  },
}

/** Standard interactive feel — pair via whileHover / whileTap. */
export const hoverLift: Target & Transition = {} as never
export const press = { scale: 0.97 }
export const hoverRise = { y: -2 }

/** Reduced-motion swap: strip movement, keep opacity storytelling. */
export function still(variants: Variants): Variants {
  const out: Variants = {}
  for (const [key, value] of Object.entries(variants)) {
    const v = { ...(value as Record<string, unknown>) }
    if (key === 'show' || key === 'exit') {
      const target = v as Record<string, unknown>
      out[key] = {
        ...(target as object),
        y: 0,
        scale: 1,
        filter: 'blur(0px)',
        clipPath: undefined,
        transition: { duration: 0.2, ease: 'linear' },
      } as never
    } else {
      out[key] = value as never
    }
  }
  return out
}
