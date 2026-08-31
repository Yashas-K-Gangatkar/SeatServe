import type { ReactNode } from 'react'
import Link from 'next/link'

/**
 * Shared chrome for the auxiliary pages (/faq, /staff, /developers, /legal/*)
 * — faithful to the live deployment: sticky slim header + simple footer.
 */
export function AuxHeader({ wide = false }: { wide?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#EFEAE0] bg-[#FAF8F5]/85 backdrop-blur">
      <div
        className={`mx-auto flex h-14 items-center justify-between px-4 sm:px-6 ${wide ? 'max-w-3xl' : 'max-w-2xl'}`}
      >
        <Link
          href="/"
          className="flex items-center gap-1.5 text-[17px] font-extrabold tracking-tight"
          aria-label="SeatServe home"
        >
          <span aria-hidden="true">🍿</span> SeatServe
        </Link>
        <Link
          href="/scan"
          className="min-h-[44px] px-2 py-3 text-sm text-[#6F6F6F] transition-colors hover:text-[#1A1A1A]"
        >
          Scan QR
        </Link>
      </div>
    </header>
  )
}

export function AuxFooter({ legal = false }: { legal?: boolean }) {
  return (
    <footer className="border-t border-[#EFEAE0] py-6 text-center text-[13px] text-[#8B8B8B]">
      {legal ? (
        <>
          <Link href="/legal/privacy" className="hover:text-[#1A1A1A]">
            Privacy
          </Link>{' '}
          ·{' '}
          <Link href="/legal/terms" className="hover:text-[#1A1A1A]">
            Terms
          </Link>{' '}
          ·{' '}
          <Link href="/legal/refund" className="hover:text-[#1A1A1A]">
            Refunds
          </Link>{' '}
          ·{' '}
          <Link href="/" className="hover:text-[#1A1A1A]">
            Home
          </Link>
        </>
      ) : (
        <>
          © 2026 SeatServe ·{' '}
          <Link href="/" className="hover:text-[#1A1A1A]">
            Home
          </Link>{' '}
          · Demo — no real payments are processed.
        </>
      )}
    </footer>
  )
}

export function AuxPage({
  children,
  wide = false,
  legal = false,
}: {
  children: ReactNode
  wide?: boolean
  legal?: boolean
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#FAF8F5] text-[#1A1A1A]">
      <AuxHeader wide={wide} />
      <main className="mx-auto w-full flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <div className={wide ? 'mx-auto max-w-3xl' : 'mx-auto max-w-2xl'}>{children}</div>
      </main>
      <AuxFooter legal={legal} />
    </div>
  )
}
