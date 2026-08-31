'use client'

/**
 * /faq — full FAQ with client-side search filtering and disclosure
 * accordion (grid-rows technique). Content mirrors the live deployment.
 */
import { useMemo, useState } from 'react'
import { ChevronDown, LifeBuoy, Search } from 'lucide-react'
import { AuxPage } from '@/components/landing/AuxChrome'

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
  {
    q: 'Which stores can I order from?',
    a: 'Every food outlet inside the venue that has joined the platform — at Aurora Mall that is Cinema Snacks, Pizza Corner, Dosa Junction, Mithai & More and Wrap House, all in one cart.',
  },
  {
    q: 'How do I pay?',
    a: 'Pay once at the end: UPI, card or netbanking. The single payment is split behind the scenes so each store receives its share automatically — you never queue twice.',
  },
  {
    q: 'Can I cancel or get a refund?',
    a: 'No — like every cinema food counter, orders are final once placed: kitchens begin preparing for your show window the moment you pay. Money moves back only in two technical cases — a payment captured without a working order (auto-reversed per RBI rules), or an outlet that cannot prepare your item at all. Details in the cancellation & refund policy.',
  },
  {
    q: 'Is my data safe?',
    a: 'We collect only what an order needs — seat and cart. Payments are handled by Razorpay; card details never touch our servers. Sessions are signed cookies and every staff action is audit-logged.',
  },
  {
    q: "I'm staff — where do I sign in?",
    a: 'At the staff sign-in page. Venue staff receive their own credentials from the venue manager — kitchen, runner, store, cinema and mall roles each see only their own scope.',
  },
] as const

export default function FaqPage() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<number | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return FAQS
    return FAQS.filter(
      (item) =>
        item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q),
    )
  }, [query])

  return (
    <AuxPage wide>
      <h1 className="text-[32px] font-bold tracking-tight sm:text-[44px]">
        Frequently asked questions
      </h1>
      <p className="mt-2 text-base text-[#6F6F6F]">
        Everything about ordering snacks to your seat.
      </p>

      <div className="relative mt-8">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B8B8B]"
          aria-hidden
        />
        <input
          type="search"
          placeholder="Search answers — stores, payment, delivery…"
          aria-label="Search the FAQ"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-12 w-full rounded-xl border border-[#E7E2D8] bg-white pl-11 pr-4 text-[15px] shadow-[0_4px_12px_rgba(0,0,0,0.05)] placeholder:text-[#8B8B8B] focus:border-[#D4AF37] focus:outline-none"
        />
      </div>

      <div className="mt-6">
        <div className="divide-y divide-[#E7E2D8] overflow-hidden rounded-2xl border border-[#E7E2D8] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.06)]">
          {filtered.length === 0 && (
            <p className="px-5 py-6 text-sm text-[#6F6F6F]">
              No answers match “{query}”. Try different words, or contact
              support below.
            </p>
          )}
          {filtered.map((item) => {
            const i = FAQS.indexOf(item)
            const expanded = open === i
            return (
              <div key={item.q}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`faq-a-${i}`}
                  onClick={() => setOpen(expanded ? null : i)}
                  className="flex min-h-[48px] w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-semibold text-[#1A1A1A] transition-colors hover:bg-[#FBF9F3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37]"
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-[#8B8B8B] transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </button>
                <div
                  id={`faq-a-${i}`}
                  aria-hidden={!expanded}
                  className={`grid transition-all duration-300 ease-out ${
                    expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="max-w-2xl px-5 pb-4 text-sm leading-[1.6] text-[#6F6F6F]">
                      {item.a}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-10 flex flex-col items-start gap-4 rounded-2xl bg-[#111114] p-6 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-[#D4AF37]" aria-hidden />
          <div>
            <h2 className="text-base font-bold">Still stuck?</h2>
            <p className="mt-0.5 text-sm text-stone-400">
              Open in-app support with your order code, or email{' '}
              <a
                href="mailto:grievance@seatserve.in"
                className="underline underline-offset-2 hover:text-white"
              >
                grievance@seatserve.in
              </a>
              .
            </p>
          </div>
        </div>
        <a
          href="/#/support"
          className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl bg-[#D4AF37] px-5 text-[15px] font-bold text-[#1A1A1A] transition active:scale-[0.98]"
        >
          Contact support
        </a>
      </div>
    </AuxPage>
  )
}
