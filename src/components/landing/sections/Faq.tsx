'use client'

/**
 * FAQ — disclosure accordion using the site's grid-rows technique
 * (grid-rows-[0fr] → [1fr]) so height animates without measuring.
 * One item opens at a time; each toggle is answered by a soft click cue.
 */
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useSound } from '@/lib/sound/SoundProvider'
import { useReveal } from '@/lib/motion/useReveal'

const FAQS = [
  {
    q: 'How do I scan the QR code?',
    a: 'Your seat has a small QR sticker on the armrest or seat back. Open seatserve on your phone, tap Scan, point the camera — the menu opens by itself. No app to install.',
  },
  {
    q: 'Can I order for my friends too?',
    a: 'Yes. One phone can order for the whole row — items from different stores go into one cart, and each store still gets only its own kitchen ticket.',
  },
  {
    q: 'What if my order gets here late or an item is cancelled?',
    a: 'You watch every store live while you wait. If an outlet cannot prepare an item at all — sold out before cooking starts, for example — that item’s amount is reversed automatically: your receipt marks it and the money returns to your original payment method within 5–7 working days. No forms, no chasing.',
  },
  {
    q: 'Is this actually free to try?',
    a: 'There is no fee to use the service — you pay only for your order, once, at checkout (UPI, card or netbanking). No booking charge, no subscription, and the payment screen always shows the exact amount before you confirm.',
  },
]

export function Faq() {
  const [open, setOpen] = useState<number | null>(null)
  const { play } = useSound()
  const reveal = useReveal<HTMLDivElement>()

  return (
    <section
      aria-label="Frequently asked questions"
      className="mx-auto max-w-2xl px-4 py-14 sm:px-6 sm:py-20"
    >
      <div ref={reveal} className="ss-reveal">
        <h2 className="text-center text-[28px] font-bold tracking-tight sm:text-[36px]">
          Questions, answered
        </h2>

        <div className="mt-8">
          <div className="divide-y divide-[#E7E2D8] overflow-hidden rounded-2xl border border-[#E7E2D8] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.06)]">
            {FAQS.map((item, i) => {
              const expanded = open === i
              return (
                <div key={item.q}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`faq-panel-${i}`}
                    onClick={() => {
                      setOpen(expanded ? null : i)
                      play('tap', 0.8)
                    }}
                    className="flex min-h-[48px] w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-semibold text-[#1A1A1A] transition-colors hover:bg-[#FBF9F3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37]"
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-[#8B8B8B] transition-transform duration-300 ${
                        expanded ? 'rotate-180' : ''
                      }`}
                      aria-hidden
                    />
                  </button>
                  <div
                    id={`faq-panel-${i}`}
                    role="region"
                    aria-hidden={!expanded}
                    className={`grid transition-all duration-300 ease-out ${
                      expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="max-w-2xl px-5 pb-5 pt-1 text-[14px] leading-[1.6] text-[#505050]">
                        {item.a}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-[#6F6F6F]">
          More questions?{' '}
          <a
            href="/faq"
            className="font-bold text-[#8a6d1f] underline underline-offset-2 hover:text-[#1A1A1A]"
          >
            See the full FAQ
          </a>
        </p>
      </div>
    </section>
  )
}
