import type { ReactNode } from 'react'

// Shared shell for the legal pages (/legal/*).
export default function LegalShell({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <div className="site-root min-h-dvh bg-[#FAF8F5] text-[#1A1A1A]">
      <header className="sticky top-0 z-40 border-b border-[#EFEAE0] bg-[#FAF8F5]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="flex items-center gap-1.5 text-[17px] font-extrabold tracking-tight" aria-label="SeatServe home">
            <span aria-hidden>🍿</span> SeatServe
          </a>
          <a href="/scan" className="inline-flex min-h-[44px] items-center text-sm font-bold text-[#8a6d1f] hover:underline">
            Scan QR
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-20 pt-12 sm:px-6">
        <a href="/" className="text-sm text-[#6F6F6F] hover:text-[#1A1A1A]">← Back</a>
        <h1 className="mt-4 text-[30px] font-bold tracking-tight sm:text-[40px]">{title}</h1>
        <p className="mt-1 text-sm text-[#8B8B8B]">Last updated {updated}</p>
        <div className="mt-8 space-y-5 text-[15px] leading-[1.7] text-[#3D3D3D] [&_a]:font-semibold [&_a]:text-[#8a6d1f] [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-9 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-[#1A1A1A] [&_li]:my-1 [&_strong]:text-[#1A1A1A] [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      </main>

      <footer className="border-t border-[#EFEAE0] py-6 text-center text-[13px] text-[#8B8B8B]">
        <a href="/legal/privacy" className="hover:text-[#1A1A1A]">Privacy</a> ·{' '}
        <a href="/legal/terms" className="hover:text-[#1A1A1A]">Terms</a> ·{' '}
        <a href="/legal/refund" className="hover:text-[#1A1A1A]">Payments</a> ·{' '}
        <a href="/" className="hover:text-[#1A1A1A]">Home</a>
      </footer>
    </div>
  )
}
