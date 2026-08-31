/**
 * NotiFetch — procedural sound design engine (Web Audio API).
 *
 * All cues are synthesized in code — original, license-clean, and tiny
 * (no audio files, no network). The manager is a singleton; components ask
 * for cues by name via the SoundProvider context.
 *
 * Design rules (from the motion brief):
 *  - never autoplay: the AudioContext is created only inside a user gesture
 *  - cues are event-locked (card arrival, notification lands, CTA press)
 *  - quiet by default (master ≈ 0.14, per-cue gains below)
 *  - every failure path is silent (no console spam, no broken interaction)
 */
import type { SoundName } from '@/lib/motion/config'

type Cue = {
  gain: number
  build: (ctx: AudioContext, out: GainNode, at: number) => void
}

const NOTE = {
  E5: 659.25,
  A5: 880,
  B5: 987.77,
  B6: 1975.53,
} as const

export class SoundManager {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null

  /** Create/resume the context. MUST be called from a user-gesture stack. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        if (!Ctor) return
        this.ctx = new Ctor()
        const compressor = this.ctx.createDynamicsCompressor()
        compressor.threshold.value = -18
        compressor.knee.value = 12
        compressor.ratio.value = 6
        this.master = this.ctx.createGain()
        this.master.gain.value = 0.14
        this.master.connect(compressor)
        compressor.connect(this.ctx.destination)
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume()
    } catch {
      /* audio unavailable — the site stays fully functional */
    }
  }

  /** Hard mute without destroying the context (instant, click-free). */
  duck(): void {
    if (this.master && this.ctx) {
      try {
        this.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.02)
      } catch {
        /* noop */
      }
    }
  }

  unduck(): void {
    if (this.master && this.ctx) {
      try {
        this.master.gain.setTargetAtTime(0.14, this.ctx.currentTime, 0.02)
      } catch {
        /* noop */
      }
    }
  }

  play(name: SoundName, volumeScale = 1): void {
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master || ctx.state !== 'running') return
    const cue = CUES[name]
    if (!cue) return
    try {
      const out = ctx.createGain()
      out.gain.value = cue.gain * volumeScale
      out.connect(master)
      cue.build(ctx, out, ctx.currentTime)
    } catch {
      /* a failed cue must never break interaction */
    }
  }

  dispose(): void {
    try {
      void this.ctx?.close()
    } catch {
      /* noop */
    }
    this.ctx = null
    this.master = null
    this.noise = null
  }
}

/* ————— synthesis recipes ————— */

function tone(
  ctx: AudioContext,
  out: GainNode,
  at: number,
  opts: {
    freq: number
    type?: OscillatorType
    attack?: number
    decay: number
    endFreq?: number
    delay?: number
    peak?: number
  },
) {
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = opts.type ?? 'sine'
  const t0 = at + (opts.delay ?? 0)
  osc.frequency.setValueAtTime(opts.freq, t0)
  if (opts.endFreq) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, opts.endFreq),
      t0 + opts.decay,
    )
  }
  const peak = opts.peak ?? 1
  env.gain.setValueAtTime(0.0001, t0)
  env.gain.exponentialRampToValueAtTime(peak, t0 + (opts.attack ?? 0.006))
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.attack! + opts.decay)
  osc.connect(env)
  env.connect(out)
  osc.start(t0)
  osc.stop(t0 + opts.attack! + opts.decay + 0.05)
}

function noiseSweep(
  ctx: AudioContext,
  out: GainNode,
  at: number,
  opts: { from: number; to: number; dur: number; peak?: number; delay?: number },
) {
  if (!NOISE.buffer || NOISE.owner !== ctx) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    NOISE.buffer = buf
    NOISE.owner = ctx
  }
  const src = ctx.createBufferSource()
  src.buffer = NOISE.buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 1.4
  const t0 = at + (opts.delay ?? 0)
  filter.frequency.setValueAtTime(opts.from, t0)
  filter.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.dur)
  const env = ctx.createGain()
  env.gain.setValueAtTime(0.0001, t0)
  env.gain.exponentialRampToValueAtTime(opts.peak ?? 0.5, t0 + opts.dur * 0.3)
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur)
  src.connect(filter)
  filter.connect(env)
  env.connect(out)
  src.start(t0)
  src.stop(t0 + opts.dur + 0.05)
}

// per-context noise buffer cache
const NOISE: { buffer: AudioBuffer | null; owner: AudioContext | null } = {
  buffer: null,
  owner: null,
}

const CUES: Record<SoundName, Cue> = {
  /** tiny interface click */
  tap: {
    gain: 0.5,
    build: (ctx, out, at) =>
      tone(ctx, out, at, { freq: 1650, decay: 0.045, peak: 0.55 }),
  },
  /** card / chip arrival — soft pitch-drop blip */
  pop: {
    gain: 0.42,
    build: (ctx, out, at) =>
      tone(ctx, out, at, {
        freq: 540,
        endFreq: 300,
        type: 'triangle',
        decay: 0.09,
        peak: 0.7,
      }),
  },
  /** THE cue — notification lands. B5 ping + faint upper partial. */
  notif: {
    gain: 0.62,
    build: (ctx, out, at) => {
      tone(ctx, out, at, { freq: NOTE.B5, decay: 0.26, peak: 0.85 })
      tone(ctx, out, at, {
        freq: NOTE.B6,
        decay: 0.14,
        peak: 0.18,
        delay: 0.012,
      })
    },
  },
  /** air sweep for section/carousel transitions */
  sweep: {
    gain: 0.34,
    build: (ctx, out, at) =>
      noiseSweep(ctx, out, at, { from: 420, to: 1500, dur: 0.28, peak: 0.4 }),
  },
  /** confirmation — E5→A5 pluck pair */
  success: {
    gain: 0.5,
    build: (ctx, out, at) => {
      tone(ctx, out, at, {
        freq: NOTE.E5,
        type: 'triangle',
        decay: 0.12,
        peak: 0.6,
      })
      tone(ctx, out, at, {
        freq: NOTE.A5,
        type: 'triangle',
        decay: 0.18,
        peak: 0.6,
        delay: 0.09,
      })
    },
  },
  /** data link completed — rounded, low-key */
  connect: {
    gain: 0.4,
    build: (ctx, out, at) => {
      const osc = ctx.createOscillator()
      const lp = ctx.createBiquadFilter()
      const env = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = 660
      lp.type = 'lowpass'
      lp.frequency.value = 1300
      env.gain.setValueAtTime(0.0001, at)
      env.gain.exponentialRampToValueAtTime(0.5, at + 0.008)
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.08)
      osc.connect(lp)
      lp.connect(env)
      env.connect(out)
      osc.start(at)
      osc.stop(at + 0.12)
    },
  },
  /** the sound switch itself — up = rising, down = falling */
  toggle: {
    gain: 0.5,
    build: (ctx, out, at) => {
      tone(ctx, out, at, {
        freq: 520,
        endFreq: 780,
        decay: 0.09,
        peak: 0.6,
      })
      tone(ctx, out, at, {
        freq: 780,
        endFreq: 520,
        decay: 0.09,
        peak: 0.45,
        delay: 0.1,
      })
    },
  },
}

/** App-wide singleton. */
export const sound = new SoundManager()
