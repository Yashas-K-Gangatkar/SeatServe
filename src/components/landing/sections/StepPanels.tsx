'use client'

/**
 * Hero phone step panels — the product story in five frames:
 * scan → browse → pay → track → arrived.
 * Each panel is plain, readable UI at phone scale; the panel *transition*
 * (handled by Hero) carries the motion. Step 1 content mirrors the live
 * deployment exactly; steps 2–5 reconstruct the site's own visual language
 * (same stores, prices and chips that appear elsewhere on the page).
 */
import { QrGrid } from '../QrGrid'

export const HERO_STEPS = [
  {
    caption: '1 · Scan your seat QR',
    chip: '📍 Seat B7 found',
    label: 'Scan',
  },
  {
    caption: '2 · Browse every menu',
    chip: '🛒 3 items · 2 stores',
    label: 'Browse',
  },
  {
    caption: '3 · Pay once',
    chip: '✅ Paid ₹630',
    label: 'Pay',
  },
  {
    caption: '4 · Track it live',
    chip: '🛵 Ravi is on the way',
    label: 'Track',
  },
  {
    caption: '5 · Enjoy the show',
    chip: '🍕 Delivered · 8 min',
    label: 'Arrived',
  },
] as const

const MENU_ROWS = [
  { emoji: '🍕', name: 'Margherita (10")', price: '₹250' },
  { emoji: '🍿', name: 'Butter Popcorn (L)', price: '₹220' },
  { emoji: '🌯', name: 'Paneer Tikka Wrap', price: '₹210' },
] as const

function ScanPanel() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#111114] p-4 text-center">
      <div className="relative rounded-xl bg-white p-2">
        <QrGrid />
        {/* viewfinder corners — the camera about to capture */}
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

function BrowsePanel() {
  return (
    <div className="flex h-full flex-col justify-center gap-2 bg-[#111114] p-3">
      {MENU_ROWS.map((item) => (
        <div
          key={item.name}
          className="flex items-center justify-between gap-2 rounded-xl bg-white p-2"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#F3EDDD] text-[11px]" aria-hidden>
              {item.emoji}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[9px] font-bold text-[#1A1A1A]">
                {item.name}
              </span>
              <span className="block text-[8px] font-semibold text-[#8B8B8B]">
                {item.price}
              </span>
            </span>
          </span>
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-[#D4AF37] text-[10px] font-black text-[#8a6d1f]"
            aria-hidden
          >
            +
          </span>
        </div>
      ))}
      <p className="text-center text-[8px] text-stone-400">
        Pizza Corner · Cinema Snacks · Wrap House
      </p>
    </div>
  )
}

function PayPanel() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2.5 bg-[#111114] p-4 text-center">
      <p className="text-[8px] font-semibold uppercase tracking-widest text-stone-400">
        One cart · three stores
      </p>
      <p className="tabular text-[22px] font-black leading-none text-white">
        ₹630
      </p>
      <div className="ss-pay-tap inline-flex items-center gap-1.5 rounded-xl bg-[#D4AF37] px-5 py-2 text-[11px] font-black text-[#1A1A1A] shadow-[0_4px_14px_rgba(212,175,55,0.4)]">
        Pay via UPI
      </div>
      <p className="text-[8px] text-stone-400">Razorpay · demo, never charged</p>
    </div>
  )
}

function TrackPanel() {
  return (
    <div className="flex h-full flex-col justify-center gap-3 bg-[#111114] p-4">
      <div className="flex items-center justify-between text-[9px] font-bold text-white">
        <span>🍕 Kitchen</span>
        <span>🛋️ Seat B7</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-white/15" aria-hidden>
        <div className="absolute inset-y-0 left-0 w-[38%] rounded-full bg-[#D4AF37]" />
        <span className="ss-run absolute top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[10px] shadow-md">
          🛵
        </span>
      </div>
      <p className="text-center text-[9px] font-bold text-white">
        Runner Ravi · Row D
      </p>
      <p className="text-center text-[8px] text-stone-400">
        Arriving in ~2 minutes
      </p>
    </div>
  )
}

function ArrivedPanel() {
  return (
    <div className="flex h-full items-center justify-center bg-[#111114] p-3">
      <div className="w-full rounded-2xl bg-white p-3 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#D4AF37] text-base"
            aria-hidden
          >
            🍿
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#8B8B8B]">
              <span>Pizza Corner</span>
              <span className="font-semibold normal-case tracking-normal">now</span>
            </p>
            <p className="mt-0.5 truncate text-[14px] font-bold leading-tight text-[#1A1A1A]">
              Your pizza is ready!
            </p>
          </div>
        </div>
        <p className="mt-1.5 text-[13px] leading-snug text-[#3F3F3F]">
          Seat B7 · Coming now
        </p>
        <p className="ss-bell mt-2 inline-block origin-left rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">
          ⚡ Arrived 2 min early
        </p>
      </div>
    </div>
  )
}

export function StepPanel({ step }: { step: number }) {
  switch (step) {
    case 0:
      return <ScanPanel />
    case 1:
      return <BrowsePanel />
    case 2:
      return <PayPanel />
    case 3:
      return <TrackPanel />
    default:
      return <ArrivedPanel />
  }
}
