'use client'

// /faq — full FAQ with client-side search + support links.
import { useMemo, useState } from 'react'
import { LifeBuoy, Search } from 'lucide-react'
import { FaqAccordion } from '@/components/site/FaqAccordion'
import { ALL_FAQ } from '@/components/site/faq-data'

export default function FaqPage() {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ALL_FAQ
    return ALL_FAQ.filter((it) => (it.q + ' ' + it.a).toLowerCase().includes(q))
  }, [query])

  return (
    <div className="site-root min-h-dvh bg-[#FAF8F5] text-[#1A1A1A]">
      <header className="sticky top-0 z-40 border-b border-[#EFEAE0] bg-[#FAF8F5]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="flex items-center gap-1.5 text-[17px] font-extrabold tracking-tight" aria-label="SeatServe home">
            <span aria-hidden>🍿</span> SeatServe
          </a>
          <a href="/scan" className="inline-flex min-h-[44px] items-center text-sm font-bold text-[#8a6d1f] hover:underline">
            Scan QR
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-20 pt-12 sm:px-6">
        <h1 className="text-[32px] font-bold tracking-tight sm:text-[44px]">Frequently asked questions</h1>
        <p className="mt-2 text-base text-[#6F6F6F]">Everything about ordering snacks to your seat.</p>

        <div className="relative mt-8">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B8B8B]" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            placeholder="Search answers — stores, payment, delivery…"
            aria-label="Search the FAQ"
            className="h-12 w-full rounded-xl border border-[#E7E2D8] bg-white pl-11 pr-4 text-[15px] shadow-[0_4px_12px_rgba(0,0,0,0.05)] placeholder:text-[#8B8B8B] focus:border-[#D4AF37] focus:outline-none"
          />
        </div>

        <div className="mt-6">
          {filtered.length > 0 ? (
            <FaqAccordion items={filtered} />
          ) : (
            <p className="rounded-2xl border border-dashed border-[#D8D3C8] bg-white p-6 text-center text-sm text-[#6F6F6F]">
              Nothing matched “{query}”. Try a different word — or ask us below.
            </p>
          )}
        </div>

        <div className="mt-10 flex flex-col items-start gap-4 rounded-2xl bg-[#111114] p-6 text-white sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-[#D4AF37]" aria-hidden />
            <div>
              <h2 className="text-base font-bold">Still stuck?</h2>
              <p className="mt-0.5 text-sm text-stone-400">
                Open in-app support with your order code, or email{' '}
                <a href="mailto:grievance@seatserve.demo" className="underline underline-offset-2 hover:text-white">
                  grievance@seatserve.demo
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
      </main>

      <footer className="border-t border-[#EFEAE0] py-6 text-center text-[13px] text-[#8B8B8B]">
        © 2026 SeatServe · <a href="/" className="hover:text-[#1A1A1A]">Home</a> · Demo — no real payments are processed.
      </footer>
    </div>
  )
}
