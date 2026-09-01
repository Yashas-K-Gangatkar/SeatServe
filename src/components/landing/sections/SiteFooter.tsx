/**
 * SiteFooter — dark anchor of the page. Static by design: the footer is the
 * end of the story, not another scene. Links preserved exactly from the live
 * deployment.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto bg-[#141414] pb-[env(safe-area-inset-bottom)] text-stone-400">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 sm:grid-cols-4 sm:px-6">
        <div>
          <p className="flex items-center gap-1.5 text-[17px] font-extrabold text-white" aria-hidden="true">
            🍿 SeatServe
          </p>
          <p className="mt-2 max-w-[220px] text-sm leading-[1.6]">
            Snacks from every store, delivered to your cinema seat.
          </p>
        </div>

        <nav aria-label="Product">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
            Product
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a href="/scan" className="inline-flex min-h-[44px] items-center hover:text-[#D4AF37] hover:underline">
                Scan a seat QR
              </a>
            </li>
            <li>
              <a href="/faq" className="inline-flex min-h-[44px] items-center hover:text-[#D4AF37] hover:underline">
                FAQ
              </a>
            </li>
            <li>
              <a
                href="/#/track"
                className="inline-flex min-h-[44px] items-center gap-1 hover:text-[#D4AF37] hover:underline"
              >
                Track an order
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3 w-3"
                  aria-hidden="true"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </a>
            </li>
          </ul>
        </nav>

        <nav aria-label="Legal">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
            Legal
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a href="/legal/privacy" className="inline-flex min-h-[44px] items-center hover:text-[#D4AF37] hover:underline">
                Privacy policy
              </a>
            </li>
            <li>
              <a href="/legal/terms" className="inline-flex min-h-[44px] items-center hover:text-[#D4AF37] hover:underline">
                Terms of use
              </a>
            </li>
            <li>
              <a href="/legal/refund" className="inline-flex min-h-[44px] items-center hover:text-[#D4AF37] hover:underline">
                Cancellation &amp; payments policy
              </a>
            </li>
          </ul>
        </nav>

        <nav aria-label="Access">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
            Access
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a href="/staff" className="inline-flex min-h-[44px] items-center hover:text-[#D4AF37] hover:underline">
                Staff login
              </a>
            </li>
            <li>
              <a href="/developers" className="inline-flex min-h-[44px] items-center hover:text-[#D4AF37] hover:underline">
                Developers
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-[13px] text-stone-500">
        © 2026 SeatServe · Payments by Razorpay · Orders fulfilled by venue outlets.
      </div>
    </footer>
  )
}
