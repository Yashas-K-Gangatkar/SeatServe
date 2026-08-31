'use client'

// Hero flow demo — a 45-second looping "video" built in code: five scenes
// (scan → browse → pay → cook → delivered) crossfade inside a phone frame
// over a cinema backdrop. Silent, autoplays, caption overlay per step.
// A real mp4 can later be dropped in here without changing the layout.
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, Plus, Wifi, BatteryFull, Signal } from 'lucide-react'

const SCENES = [
  '1 · Scan your seat QR',
  '2 · Browse every store',
  '3 · Pay once',
  '4 · Kitchens start cooking',
  '5 · Delivered to your seat',
]

function PhoneChrome() {
  return (
    <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 pt-1.5 text-[8px] font-semibold text-stone-800">
      <span>9:41</span>
      <span className="flex items-center gap-0.5">
        <Signal className="h-2 w-2" aria-hidden />
        <Wifi className="h-2 w-2" aria-hidden />
        <BatteryFull className="h-2.5 w-2.5" aria-hidden />
      </span>
    </div>
  )
}

function FakeQr() {
  // decorative finder-pattern QR (5 rows of repeating blocks)
  const rows = ['111111101110111', '100000101000100', '101110101110101', '101110100010101', '101110101110101', '100000100100100', '111111101010111', '000000011010001', '110101100101110', '011010010110100', '100101101101011', '010110100110010', '111010011001101', '100010110100101', '111111101101101']
  return (
    <div className="grid gap-px rounded-lg bg-white p-2 shadow-sm" style={{ gridTemplateColumns: 'repeat(15, minmax(0,1fr))' }} aria-hidden>
      {rows.join('').split('').map((c, i) => (
        <span key={i} className={`aspect-square w-[7px] ${c === '1' ? 'bg-stone-900' : 'bg-white'}`} />
      ))}
    </div>
  )
}

const MENU_ROWS = [
  { img: '/landing/pizza.png', name: 'Margherita', price: '₹249' },
  { img: '/landing/popcorn.png', name: 'Butter Popcorn', price: '₹180' },
  { img: '/landing/chai.png', name: 'Masala Chai', price: '₹60' },
]

function Scene({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#111114] p-4 text-center">
        <div className="relative rounded-xl bg-white p-2">
          <FakeQr />
          <span className="absolute left-0 top-0 h-4 w-4 border-l-2 border-t-2 border-[#D4AF37]" />
          <span className="absolute right-0 top-0 h-4 w-4 border-r-2 border-t-2 border-[#D4AF37]" />
          <span className="absolute bottom-0 left-0 h-4 w-4 border-b-2 border-l-2 border-[#D4AF37]" />
          <span className="absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 border-[#D4AF37]" />
        </div>
        <p className="text-[10px] font-bold text-white">Screen 3 · Seat B7</p>
        <p className="text-[8px] text-stone-400">Aurora Mall · Cineplex Wing A</p>
      </div>
    )
  }
  if (index === 1) {
    return (
      <div className="flex h-full flex-col gap-1.5 bg-[#FAF8F5] p-2.5 pt-6">
        <p className="text-[9px] font-black uppercase tracking-wider text-stone-500">All stores · one cart</p>
        {MENU_ROWS.map((r) => (
          <div key={r.name} className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white p-1.5">
            <span className="relative h-7 w-9 shrink-0 overflow-hidden rounded-md">
              <Image src={r.img} alt="" fill className="object-cover" sizes="60px" />
            </span>
            <span className="flex-1 truncate text-[9px] font-bold text-stone-900">{r.name}</span>
            <span className="text-[9px] font-extrabold tabular text-stone-700">{r.price}</span>
            <span className="ss-pulse-ring flex h-5 w-5 items-center justify-center rounded-full bg-[#D4AF37]">
              <Plus className="h-3 w-3 text-[#1A1A1A]" aria-hidden />
            </span>
          </div>
        ))}
        <p className="mt-auto text-[8px] text-stone-400">Pizza Corner · Cinema Snacks · Dosa Junction</p>
      </div>
    )
  }
  if (index === 2) {
    return (
      <div className="flex h-full flex-col gap-2 bg-[#FAF8F5] p-3 pt-6">
        <p className="text-[9px] font-black uppercase tracking-wider text-stone-500">One payment</p>
        <div className="rounded-xl border border-stone-200 bg-white p-2 text-[9px]">
          <div className="flex justify-between"><span className="text-stone-500">Pizza Corner</span><span className="font-bold tabular">₹249</span></div>
          <div className="flex justify-between"><span className="text-stone-500">Cinema Snacks</span><span className="font-bold tabular">₹240</span></div>
          <div className="mt-1 flex justify-between border-t border-dashed border-stone-200 pt-1">
            <span className="font-black">Total</span><span className="font-black tabular">₹489</span>
          </div>
        </div>
        <div className="relative mt-1">
          <span className="block w-full rounded-lg bg-[#D4AF37] py-2 text-center text-[10px] font-extrabold text-[#1A1A1A]">Pay ₹489 · UPI</span>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.2, duration: 0.4 }}
            className="absolute inset-0 flex items-center justify-center gap-1 rounded-lg bg-emerald-500 text-[10px] font-extrabold text-white"
          >
            <Check className="h-3 w-3" aria-hidden /> Paid
          </motion.span>
        </div>
        <p className="mt-auto text-[8px] text-stone-400">Split automatically by store</p>
      </div>
    )
  }
  if (index === 3) {
    return (
      <div className="flex h-full flex-col gap-2 bg-[#FAF8F5] p-3 pt-6">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-2">
          <p className="text-[8px] font-bold uppercase tracking-wider text-amber-700">Pizza Corner · Ticket</p>
          <p className="text-[10px] font-black text-stone-900">Seat B7 · PREPARING</p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-amber-200">
            <motion.div initial={{ width: '18%' }} animate={{ width: '82%' }} transition={{ duration: 5, ease: 'easeInOut' }} className="h-full rounded-full bg-amber-500" />
          </div>
        </div>
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-2">
          <p className="text-[8px] font-bold uppercase tracking-wider text-emerald-700">Cinema Snacks · Ticket</p>
          <p className="text-[10px] font-black text-stone-900">Seat B7 · READY</p>
        </div>
        <p className="mt-auto text-[8px] text-stone-400">Each store sees only its own ticket</p>
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-[#111114] p-3 text-center">
      <motion.div
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        className="w-full rounded-xl bg-white/95 p-2.5 text-left shadow-lg"
      >
        <div className="flex items-center gap-1.5">
          <span className="text-xs">🍕</span>
          <span className="text-[8px] font-bold uppercase tracking-wider text-stone-500">Pizza Corner · now</span>
        </div>
        <p className="mt-0.5 text-[10px] font-bold leading-snug text-stone-900">Your pizza is ready. Seat B7 — coming now!</p>
        <p className="mt-1 inline-block rounded-full bg-emerald-100 px-1.5 py-0.5 text-[7px] font-extrabold text-emerald-700">⚡ Arrived 2 min early</p>
      </motion.div>
      <p className="text-[9px] font-bold text-emerald-400">Delivered to Seat B7 ✓</p>
    </div>
  )
}

export default function FlowDemo() {
  const [i, setI] = useState(0)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced) return
    const t = setInterval(() => setI((v) => (v + 1) % SCENES.length), 9000)
    return () => clearInterval(t)
  }, [reduced])

  return (
    <div className="w-full">
      <div className="relative aspect-square w-full overflow-hidden rounded-[2rem] shadow-[0_24px_60px_rgba(0,0,0,0.18)] sm:aspect-[16/10]">
        <Image src="/landing/cinema.png" alt="Cinema auditorium with warm lighting" fill priority sizes="(max-width: 640px) 100vw, 720px" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/40" />
        {/* phone */}
        <div className="absolute left-1/2 top-1/2 w-[44%] max-w-[220px] min-w-[170px] -translate-x-1/2 -translate-y-1/2">
          <div className="relative aspect-[9/17] overflow-hidden rounded-[1.6rem] border-[5px] border-stone-900 bg-white shadow-2xl">
            <PhoneChrome />
            <AnimatePresence mode="wait">
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="h-full w-full"
              >
                <Scene index={i} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
      {/* captions + progress dots */}
      <div className="mt-4 flex flex-col items-center gap-2.5">
        <p className="text-sm font-semibold text-[#1A1A1A]" aria-live="polite">{SCENES[i]}</p>
        <div className="flex gap-1.5" role="presentation">
          {SCENES.map((_, d) => (
            <button
              key={d}
              type="button"
              aria-label={`Show step ${d + 1}`}
              onClick={() => setI(d)}
              className={`h-1.5 rounded-full transition-all duration-300 ${d === i ? 'w-6 bg-[#D4AF37]' : 'w-1.5 bg-[#D8D3C8] hover:bg-[#C8C2B4]'}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
