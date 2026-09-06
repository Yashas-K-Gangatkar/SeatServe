'use client'

/**
 * MenuShowcase — horizontal snap scroller of real pilot menu items.
 * Cards arrive with a soft stagger (spring, once), the imagery keeps the
 * site's hover zoom, and every Add press gets a tiny physical compression
 * plus its own pop cue. The scroller is native overflow — momentum and
 * a11y come free; edge fades hint at more without fake chrome.
 */
import { motion } from 'framer-motion'
import { SPRING, STAGGER } from '@/lib/motion/config'
import { fadeUp, scaleIn, stagger } from '@/lib/motion/variants'
import { useSound } from '@/lib/sound/SoundProvider'

type MenuItem = {
  name: string
  price: number
  img: string
  store: string
  emoji: string
}

// Mirrors the LIVE demo canteen menu (same items + photos the Campus Canteen
// store serves — scripts/seed-campus-demo.mjs). One counter, real prices.
const MENU: MenuItem[] = [
  { name: 'Samosa (2 pcs)', price: 20, img: '/menu/samosa.jpg', store: 'Campus Canteen', emoji: '🥟' },
  { name: 'Masala Chai', price: 15, img: '/menu/masala-chai.jpg', store: 'Campus Canteen', emoji: '☕' },
  { name: 'Filter Coffee', price: 20, img: '/menu/filter-coffee.jpg', store: 'Campus Canteen', emoji: '☕' },
  { name: 'Veg Momo (6 pcs)', price: 40, img: '/menu/momo.jpg', store: 'Campus Canteen', emoji: '🥟' },
  { name: 'Peri Peri Fries', price: 35, img: '/menu/peri-peri-fries.jpg', store: 'Campus Canteen', emoji: '🍟' },
  { name: 'Cold Coffee', price: 30, img: '/menu/cold-coffee.jpg', store: 'Campus Canteen', emoji: '🥤' },
]

export function MenuShowcase() {
  const { play } = useSound()

  return (
    <section
      aria-label="Menu preview"
      className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20"
    >
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '0px 0px -10% 0px' }}
        variants={stagger(STAGGER.base)}
      >
        <motion.h2
          variants={fadeUp}
          className="text-center text-[28px] font-bold tracking-tight sm:text-[36px]"
        >
          Straight from the menus
        </motion.h2>
        <motion.p
          variants={fadeUp}
          className="mt-3 text-center text-base text-[#6F6F6F]"
        >
          Real items from the campus canteen — swipe through, tap add to
          open the live demo.
        </motion.p>
      </motion.div>

      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '0px 0px -8% 0px' }}
        variants={stagger(STAGGER.tight, 0.15)}
        className="nf-scroll-x mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 sm:gap-5"
        role="list"
        aria-label="Menu items"
      >
        {MENU.map((item) => (
          <motion.div
            key={item.name}
            role="listitem"
            variants={scaleIn}
            className="ss-imgzoom w-[236px] shrink-0 snap-start overflow-hidden rounded-2xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-[0_10px_28px_rgba(0,0,0,0.12)] sm:w-[260px]"
          >
            <div className="relative aspect-video w-full overflow-hidden">
              <img
                src={item.img}
                alt={item.name}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
            <div className="p-4">
              <p className="inline-flex items-center gap-1 rounded-full bg-[#F3EDDD] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#8a6d1f]">
                <span aria-hidden="true">{item.emoji}</span> {item.store}
              </p>
              <div className="mt-2 flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-bold">{item.name}</h3>
                  <p className="tabular text-[15px] font-black text-[#1A1A1A]">
                    <span className="text-[#8a6d1f]">₹</span>
                    {item.price}
                  </p>
                </div>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  transition={SPRING.release}
                  onClick={() => play('pop', 0.8)}
                  className="inline-flex h-11 min-w-[64px] items-center justify-center rounded-xl border border-[#D4AF37] bg-transparent px-3 text-sm font-bold text-[#8a6d1f] transition-all hover:bg-[#D4AF37] hover:text-[#1A1A1A] active:scale-[0.98]"
                  aria-label={`Add ${item.name} — opens the demo`}
                >
                  Add
                </motion.button>
              </div>
            </div>
          </motion.div>
        ))}

        {/* see-full-menu card — same as the live site's dashed tail card */}
        <motion.a
          role="listitem"
          variants={scaleIn}
          href="/#/"
          onClick={() => play('tap')}
          className="flex w-[236px] shrink-0 snap-start flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#D4AF37]/50 bg-white/50 p-6 text-center transition-colors hover:border-[#D4AF37] hover:bg-[#D4AF37]/[0.06] sm:w-[260px]"
        >
          <span className="text-[15px] font-bold text-[#8a6d1f]">
            See Full Menu →
          </span>
          <span className="mt-1 text-xs text-[#8B8B8B]">
            Full canteen menu · live demo
          </span>
        </motion.a>
      </motion.div>
    </section>
  )
}
