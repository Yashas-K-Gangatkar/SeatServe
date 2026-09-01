'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { Volume2, VolumeX } from 'lucide-react'
import { SPRING } from '@/lib/motion/config'
import { useSound } from '@/lib/sound/SoundProvider'

/**
 * Visible sound control — default OFF, persisted, never autoplays.
 * Lives in the sticky header so it is reachable from every section.
 */
export function SoundToggle() {
  const { enabled, toggle } = useSound()
  const reduced = useReducedMotion()

  return (
    <motion.button
      type="button"
      onClick={toggle}
      whileTap={reduced ? undefined : { scale: 0.94 }}
      transition={SPRING.release}
      aria-pressed={enabled}
      aria-label={enabled ? 'Turn sound effects off' : 'Turn sound effects on'}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[#EFEAE0] bg-white/70 px-3 py-1.5 text-xs font-bold text-[#6F6F6F] transition-colors hover:border-[#D4AF37]/50 hover:text-[#1A1A1A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37]"
      data-sound-state={enabled ? 'on' : 'off'}
    >
      {enabled ? (
        <Volume2 className="h-3.5 w-3.5 text-[#8a6d1f]" aria-hidden />
      ) : (
        <VolumeX className="h-3.5 w-3.5" aria-hidden />
      )}
      <span className="hidden sm:inline">{enabled ? 'Sound on' : 'Sound off'}</span>
    </motion.button>
  )
}
