'use client'

/**
 * NotiFetch — per-event haptics (Vibration API).
 *
 * Mirrors the sound design 1:1: every UI event that fires a cue also fires a
 * matching micro-vibration, so on phones the interaction is felt as well as
 * heard. Follows the same preference switch as sound (one toggle controls
 * both) and fails completely silent on devices without a vibration motor.
 *
 * Design rules:
 *  - only discrete, intentional moments vibrate (presses, arrivals, confirms)
 *  - continuous/scroll-driven events (`sweep`) never vibrate — a phone that
 *    buzzes while you scroll feels broken, not premium
 *  - patterns are tiny (≤ 3 pulses, ≤ 120 ms total) — haptics are punctuation,
 *    not percussion
 *  - every call is a no-op on iOS Safari (no Vibration API) and any failure
 *    path — the interaction itself must never depend on haptics
 */
import type { SoundName } from '@/lib/motion/config'

/**
 * Vibration pattern per cue. Absent = that event stays silent (currently
 * only `sweep`, which is scroll/carousel-driven rather than a user gesture).
 */
const PATTERNS: Partial<Record<SoundName, number | number[]>> = {
  /** interface press — one tight 8 ms tick */
  tap: 8,
  /** card / chip arrival — a soft 14 ms thud */
  pop: 14,
  /** notification lands — pulse, breathe, confirm (the signature moment) */
  notif: [10, 60, 16],
  /** action confirmed — double-tick */
  success: [12, 50, 12],
  /** data link completed — single rounded pulse */
  connect: 10,
  /** the switch itself — up-down pair */
  toggle: [8, 30, 8],
}

/** Fire the pattern for a cue. Safe to call from anywhere; never throws. */
export function hapticFor(name: SoundName): void {
  try {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
    const pattern = PATTERNS[name]
    if (pattern === undefined) return
    navigator.vibrate(pattern)
  } catch {
    /* haptics unavailable — the site stays fully functional */
  }
}
