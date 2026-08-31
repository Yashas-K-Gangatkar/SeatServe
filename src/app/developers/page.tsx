// /developers — everything removed from the public landing lives here:
// architecture, phases, roles, API surface, realtime, payment internals.
import type { ReactNode } from 'react'

export const metadata = {
  title: 'SeatServe — developer & architecture notes',
  description: 'Technical documentation: architecture, roles, API surface, realtime and payment design.',
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold text-[#1A1A1A]">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-[1.7] text-[#3D3D3D]">{children}</div>
    </section>
  )
}

function Table({ rows, head }: { rows: string[][]; head: string[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E7E2D8] bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-[#E7E2D8] bg-[#FBF9F3] text-[11px] uppercase tracking-wider text-[#8B8B8B]">
              {head.map((h) => (
                <th key={h} scope="col" className="px-4 py-2.5 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEAE0]">
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={`px-4 py-2.5 ${j === 0 ? 'font-mono text-[12px]' : 'text-[#6F6F6F]'}`}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function DevelopersPage() {
  return (
    <div className="site-root min-h-dvh bg-[#FAF8F5] text-[#1A1A1A]">
      <header className="sticky top-0 z-40 border-b border-[#EFEAE0] bg-[#FAF8F5]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="flex items-center gap-1.5 text-[17px] font-extrabold tracking-tight" aria-label="SeatServe home">
            <span aria-hidden>🍿</span> SeatServe
          </a>
          <a href="/staff" className="inline-flex min-h-[44px] items-center text-sm text-[#6F6F6F] hover:text-[#1A1A1A]">
            Staff
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-12 sm:px-6">
        <h1 className="text-[32px] font-bold tracking-tight sm:text-[44px]">Developer notes</h1>
        <p className="mt-2 text-base text-[#6F6F6F]">
          How the platform is built — the content that used to clutter the front page now lives here.
        </p>

        <Section title="Stack">
          <p>
            Next.js 16 (App Router) + TypeScript + Tailwind 4 + shadcn/ui, Prisma ORM (SQLite locally, managed Postgres in
            production), Zustand client state, socket.io for realtime, sonner toasts, bun as the toolchain. Deployed on
            Vercel; realtime socket runs alongside the standalone server and the client falls back to interval polling
            where websockets are unavailable.
          </p>
        </Section>

        <Section title="Build phases">
          <Table
            head={['Phase', 'Scope', 'State']}
            rows={[
              ['Phase 1', 'Clickable demo — simulated payment, staff dashboards, seat QR codes', 'done'],
              ['Phase 2', 'Platform core — auth, role scoping, staff portal, session security, tests', 'done'],
              ['Phase 3', 'Real rails — Razorpay Route / Cashfree Easy Split, signed webhooks, refunds, settlements', 'in progress'],
              ['Phase 4', 'Production — Postgres cutover, merchant KYC onboarding, security & legal review', 'planned'],
            ]}
          />
        </Section>

        <Section title="Roles & access control (RBAC)">
          <p>
            Six roles, every console scoped by mall → cinema → store → runner. Sessions are httpOnly signed cookies;
            login is rate-limited; every staff action writes an audit-log row.
          </p>
          <Table
            head={['Role', 'Console', 'Scope']}
            rows={[
              ['MALL_ADMIN', '#/admin', 'Own mall: all stores, settlements, KYC, QR sheet, resets'],
              ['CINEMA_MANAGER', '#/admin', 'Own cinema: screens, showtimes, cutoffs'],
              ['STORE_MANAGER', '#/admin', 'Own store: menu, availability, refunds, ticket reassign'],
              ['KITCHEN_STAFF', '#/kitchen', 'Own store ticket queue only'],
              ['RUNNER', '#/runner', 'Own zone delivery runs only'],
              ['CUSTOMER', '#/seat', 'Seat-scoped ordering, own order tracking'],
            ]}
          />
        </Section>

        <Section title="API surface">
          <Table
            head={['Endpoint', 'Purpose']}
            rows={[
              ['POST /api/auth/login · logout · GET me', 'Session lifecycle for staff roles'],
              ['GET /api/context?qr=', 'Seat-scoped venue/menu payload for the ordering UI'],
              ['GET /api/stores', 'Public store directory'],
              ['POST /api/orders · GET /api/orders/[code]', 'Place order (server computes money) · live tracking'],
              ['POST /api/orders/[code]/cancel-leg', 'Per-store cancellation with auto refund record'],
              ['POST /api/payments/session · mock-pay · webhook', 'Gateway session, sandbox capture, signed webhook ingestion'],
              ['GET /api/kitchen/tickets · /api/runner', 'Scoped staff queues'],
              ['GET /api/admin/*', 'QR sheet, overview, KYC, settlement, refunds, reconciliation, seat-trace'],
              ['GET /api/health', 'Liveness probe'],
            ]}
          />
        </Section>

        <Section title="Realtime">
          <p>
            A socket.io server fans out order/ticket events to seat, kitchen, runner and admin views. On Vercel (no
            long-lived sockets) the client automatically falls back to short-interval polling, so tracking stays live
            everywhere. Realtime upgrades (hosted websocket provider) slot behind the same event bridge.
          </p>
        </Section>

        <Section title="Payments & the split ledger">
          <p>
            The server is the only place money is computed — integer paise, GST extracted as inclusive, 5% platform fee
            on the grand total. Every order writes a split ledger (STORE / PLATFORM_COMMISSION rows) whose amounts always
            sum to the paid total; the seeded sample order SS-DEMO02 totals ₹754.40 with a verified split. Payments are
            currently simulated end-to-end (signed webhooks, idempotent event handling); flipping
            PAYMENT_PROVIDER=razorpay with Route linked accounts moves real money with the same ledger.
          </p>
        </Section>

        <Section title="Data model">
          <p>
            22 Prisma models: Mall / Cinema / Screen / Seat(qrToken) / Showtime(cutoff) / DeliveryZone / Store(KYC,
            commission) / Product(paise, GST, prep ETA, veg, allergens) / Cart / CartItem / Order / OrderItem(price
            snapshots) / StoreTicket / Runner / DeliveryRun / Payment / PaymentEvent / Refund / Split / Settlement /
            User / AuditLog / AppSetting. Seat QR tokens are 10-char random capabilities; order codes are SS-XXXXXX.
          </p>
        </Section>

        <Section title="Compliance & legal docs">
          <p>
            India compliance checklist, money-flow rules and legal notes live in the repo:{' '}
            <a href="https://github.com/Yashas-K-Gangatkar/SeatServe" className="font-semibold text-[#8a6d1f] underline underline-offset-2">
              docs/LEGAL-COMPLIANCE-INDIA.md
            </a>{' '}
            and docs/LEGAL-NOTES.md.
          </p>
        </Section>
      </main>

      <footer className="border-t border-[#EFEAE0] py-6 text-center text-[13px] text-[#8B8B8B]">
        © 2026 SeatServe · <a href="/" className="hover:text-[#1A1A1A]">Home</a> · Demo — no real payments are processed.
      </footer>
    </div>
  )
}
