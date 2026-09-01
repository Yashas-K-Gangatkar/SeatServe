'use client'

/**
 * CtaBand — the conversion moment. One breathing gold border (8s clock,
 * same rhythm family as the hero zoom) draws the eye without asking;
 * everything else stays still. Click sounds are event-locked to the press.
 */
import { motion } from 'framer-motion'
import { ScanLine } from 'lucide-react'
import { fadeUp } from '@/lib/motion/variants'
import { useSound } from '@/lib/sound/SoundProvider'

export function CtaBand({ demoSeatHref }: { demoSeatHref: string | null }) {
  const { play } = useSound()

  return (
    <section
      aria-label="Start ordering"
      className="mx-auto max-w-5xl px-4 py-10 sm:px-6"
    >
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '0px 0px -10% 0px' }}
        variants={fadeUp}
        className="nf-cta-glow rounded-3xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.06] px-6 py-12 text-center sm:px-10"
      >
        <h2 className="text-[26px] font-bold tracking-tight text-[#1A1A1A] sm:text-[32px]">
          Hungry already?
        </h2>
        <p className="mx-auto mt-2 max-w-md text-base text-[#6F6F6F]">
          Scan a QR code from your seat or try the live demo below.
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <motion.a
            href="/scan"
            onClick={() => play('tap')}
            whileTap={{ scale: 0.98 }}
            className="inline-flex h-12 w-full max-w-xs items-center justify-center rounded-xl px-8 text-[15px] font-bold shadow-[0_4px_12px_rgba(212,175,55,0.35)] transition-all hover:scale-[1.02] hover:shadow-[0_8px_20px_rgba(212,175,55,0.45)] active:scale-[0.98] sm:w-[200px] bg-[#D4AF37] text-[#1A1A1A] hover:bg-[#C39B2A]"
          >
            <ScanLine className="mr-2 h-4.5 w-4.5" aria-hidden />
            Start Ordering
          </motion.a>
          <motion.button
            type="button"
            disabled={!demoSeatHref}
            onClick={() => {
              play('tap')
              if (demoSeatHref) window.location.hash = demoSeatHref
            }}
            whileTap={demoSeatHref ? { scale: 0.98 } : undefined}
            className="inline-flex h-12 w-full max-w-xs items-center justify-center rounded-xl border-2 border-[#D4AF37] bg-transparent px-8 text-[15px] font-semibold text-[#8a6d1f] transition-all hover:border-[#C99F2E] hover:bg-[#D4AF37]/10 hover:text-[#C99F2E] active:scale-[0.98] disabled:opacity-50 sm:w-[170px]"
          >
            Try the Demo
          </motion.button>
        </div>
      </motion.div>
    </section>
  )
}
