'use client'

// Collapsible FAQ accordion — all items collapsed by default, chevron rotates on open.
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { FaqItem } from './faq-data'

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <div className="divide-y divide-[#E7E2D8] overflow-hidden rounded-2xl border border-[#E7E2D8] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.06)]">
      {items.map((it, idx) => {
        const isOpen = open === idx
        return (
          <div key={it.q}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : idx)}
              aria-expanded={isOpen}
              className="flex min-h-[48px] w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-semibold text-[#1A1A1A] transition-colors hover:bg-[#FBF9F3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37]"
            >
              <span>{it.q}</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-[#8B8B8B] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
            <div
              className={`grid transition-all duration-300 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
            >
              <div className="overflow-hidden">
                <p className="max-w-2xl px-5 pb-4 text-sm leading-[1.6] text-[#6F6F6F]">{it.a}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
