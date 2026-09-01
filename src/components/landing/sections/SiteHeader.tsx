'use client'

import { motion } from 'framer-motion'
import { fadeRise } from '@/lib/motion/variants'
import { SoundToggle } from '../SoundToggle'

/**
 * Sticky site header — brand, sound control, staff entry.
 * Entrance is one quiet rise; the header itself never moves afterwards
 * (stable anchor so the moving sections read as deliberate).
 */
export function SiteHeader() {
  return (
    <motion.header
      initial="hidden"
      animate="show"
      variants={fadeRise}
      className="sticky top-0 z-40 border-b border-[#EFEAE0] bg-[#FAF8F5]/85 backdrop-blur"
    >
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <a
          href="/"
          className="flex items-center gap-1.5 text-[17px] font-extrabold tracking-tight"
          aria-label="SeatServe home"
        >
          <span aria-hidden="true">🍿</span> SeatServe
        </a>
        <div className="flex items-center gap-2">
          <SoundToggle />
          <a
            href="/staff"
            className="min-h-[44px] px-2 py-3 text-sm text-[#6F6F6F] transition-colors hover:text-[#1A1A1A]"
          >
            Staff sign in
          </a>
        </div>
      </div>
    </motion.header>
  )
}
