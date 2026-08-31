'use client'

<<<<<<< HEAD
/**
 * /staff — demo account directory + password hint, feeding the in-app
 * staff sign-in console (#/staff/login). Data mirrors the live deployment.
 */
import { useState } from 'react'
import { Check, ClipboardCopy, LogIn } from 'lucide-react'
import { AuxPage } from '@/components/landing/AuxChrome'

const ACCOUNTS: { role: string; email: string; scope: string }[] = [
  { role: 'Mall admin', email: 'asha@seatserve.demo', scope: 'Aurora Mall — oversees all stores, settlements, QR sheet' },
  { role: 'Cinema manager', email: 'vikram@aurora.demo', scope: 'Aurora Cineplex Wing A — own cinema only' },
  { role: 'Kitchen', email: 'kitchen@cinema-snacks.demo', scope: 'Cinema Snacks counter tickets' },
  { role: 'Kitchen', email: 'kitchen@pizza-corner.demo', scope: 'Pizza Corner kitchen tickets' },
  { role: 'Kitchen', email: 'kitchen@wrap-house.demo', scope: 'Wrap House kitchen tickets' },
  { role: 'Kitchen', email: 'kitchen@mithai-more.demo', scope: 'Mithai & More counter tickets' },
  { role: 'Store manager', email: 'manager@cinema-snacks.demo', scope: 'Cinema Snacks — menu, availability, refunds' },
  { role: 'Runner', email: 'ravi@runner.demo', scope: 'Ravi — Wing A delivery runs' },
  { role: 'Runner', email: 'sana@runner.demo', scope: 'Sana — Wing B delivery runs' },
]

const ROLE_COLORS: Record<string, string> = {
  'Mall admin': 'bg-[#F3EDDD] text-[#8a6d1f]',
  'Cinema manager': 'bg-sky-100 text-sky-700',
  Kitchen: 'bg-orange-100 text-orange-700',
  'Store manager': 'bg-emerald-100 text-emerald-700',
  Runner: 'bg-violet-100 text-violet-700',
}
=======
// /staff — clean staff entry page: demo credentials table + sign-in hand-off.
// Kept out of the customer journey on purpose (one small footer link).
import { useState } from 'react'
import { ArrowRight, ClipboardCopy, LockKeyhole } from 'lucide-react'
import { toast } from 'sonner'

const ACCOUNTS: { role: string; email: string; who: string }[] = [
  { role: 'Mall admin', email: 'asha@seatserve.demo', who: 'Aurora Mall — oversees all stores, settlements, QR sheet' },
  { role: 'Cinema manager', email: 'vikram@aurora.demo', who: 'Aurora Cineplex Wing A — own cinema only' },
  { role: 'Kitchen', email: 'kitchen@cinema-snacks.demo', who: 'Cinema Snacks counter tickets' },
  { role: 'Kitchen', email: 'kitchen@pizza-corner.demo', who: 'Pizza Corner kitchen tickets' },
  { role: 'Kitchen', email: 'kitchen@wrap-house.demo', who: 'Wrap House kitchen tickets' },
  { role: 'Kitchen', email: 'kitchen@mithai-more.demo', who: 'Mithai & More counter tickets' },
  { role: 'Store manager', email: 'manager@cinema-snacks.demo', who: 'Cinema Snacks — menu, availability, refunds' },
  { role: 'Runner', email: 'ravi@runner.demo', who: 'Ravi — Wing A delivery runs' },
  { role: 'Runner', email: 'sana@runner.demo', who: 'Sana — Wing B delivery runs' },
]

const DEMO_PASSWORD = 'demo1234'
>>>>>>> origin/main

export default function StaffPage() {
  const [copied, setCopied] = useState(false)

<<<<<<< HEAD
  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText('demo1234')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable — the password is visible anyway */
    }
  }

  return (
    <AuxPage wide>
      <h1 className="text-[32px] font-bold tracking-tight sm:text-[44px]">
        Staff sign-in
      </h1>
      <p className="mt-2 max-w-xl text-base leading-[1.6] text-[#6F6F6F]">
        One password for the demo pilot. Each role signs in to a console scoped
        to just its own store, zone or venue.
      </p>

      <p className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#F3EDDD] px-3 py-1.5 text-[13px] font-semibold text-[#8a6d1f]">
        Password for all demo accounts:
        <code className="rounded bg-white px-1.5 py-0.5 font-black tracking-wide text-[#1A1A1A]">
          demo1234
        </code>
        <button
          type="button"
          onClick={() => void copyPassword()}
          aria-label="Copy demo password"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-[#D4AF37]/20"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      </p>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-[#E7E2D8] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.06)]">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#E7E2D8] bg-[#FBF9F3] text-[11px] uppercase tracking-wider text-[#8B8B8B]">
              <th scope="col" className="px-5 py-3 font-bold">
                Role
              </th>
              <th scope="col" className="px-5 py-3 font-bold">
                Email
              </th>
              <th scope="col" className="px-5 py-3 font-bold">
                What you’ll see
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEAE0]">
            {ACCOUNTS.map((account) => (
              <tr key={account.email} className="transition-colors hover:bg-[#FBF9F3]">
                <td className="px-5 py-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-extrabold ${ROLE_COLORS[account.role] ?? 'bg-[#F3EDDD] text-[#8a6d1f]'}`}
                  >
                    {account.role}
                  </span>
                </td>
                <td className="px-5 py-3 font-mono text-[13px] font-semibold text-[#3D3D3D]">
                  {account.email}
                </td>
                <td className="px-5 py-3 text-[13px] leading-snug text-[#6F6F6F]">
                  {account.scope}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 flex flex-col items-start gap-4">
        <a
          href="/#/staff/login"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-6 text-[15px] font-bold text-[#1A1A1A] shadow-[0_4px_12px_rgba(212,175,55,0.35)] transition-all hover:scale-[1.02] hover:bg-[#C39B2A] active:scale-[0.98]"
        >
          <LogIn className="h-4 w-4" aria-hidden />
          Continue to sign in
        </a>
        <p className="text-[13px] leading-[1.6] text-[#8B8B8B]">
          These are sandbox accounts for the pilot. Production venues get real
          staff identities with per-venue credentials.
        </p>
      </div>
    </AuxPage>
=======
  return (
    <div className="site-root min-h-dvh bg-[#FAF8F5] text-[#1A1A1A]">
      <header className="sticky top-0 z-40 border-b border-[#EFEAE0] bg-[#FAF8F5]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="flex items-center gap-1.5 text-[17px] font-extrabold tracking-tight" aria-label="SeatServe home">
            <span aria-hidden>🍿</span> SeatServe
          </a>
          <a href="/scan" className="inline-flex min-h-[44px] items-center text-sm text-[#6F6F6F] hover:text-[#1A1A1A]">
            Customer app
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-20 pt-12 sm:px-6">
        <div className="flex items-center gap-2">
          <LockKeyhole className="h-5 w-5 text-[#8a6d1f]" aria-hidden />
          <h1 className="text-[28px] font-bold tracking-tight sm:text-[36px]">Staff sign-in</h1>
        </div>
        <p className="mt-2 max-w-xl text-base leading-[1.6] text-[#6F6F6F]">
          One password for the demo pilot. Each role signs in to a console scoped to just its own store, zone or venue.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-[#E7E2D8] bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.06)]">
          <span className="text-sm text-[#6F6F6F]">Password for all demo accounts:</span>
          <code className="rounded-lg bg-[#F3EDDD] px-2.5 py-1 font-mono text-[15px] font-bold tracking-wide">{DEMO_PASSWORD}</code>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(DEMO_PASSWORD)
                setCopied(true)
                toast.success('Password copied', { duration: 4000 })
                window.setTimeout(() => setCopied(false), 2000)
              } catch {
                toast.error('Copy failed — select it manually', { duration: 4000 })
              }
            }}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#D8D3C8] px-3 py-2 text-[13px] font-bold transition hover:bg-[#FBF9F3] active:scale-[0.98]"
          >
            <ClipboardCopy className="h-3.5 w-3.5" aria-hidden /> {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-[#E7E2D8] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.06)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">Demo staff accounts and what each console shows</caption>
              <thead>
                <tr className="border-b border-[#E7E2D8] bg-[#FBF9F3] text-[11px] uppercase tracking-wider text-[#8B8B8B]">
                  <th scope="col" className="px-5 py-3 font-bold">Role</th>
                  <th scope="col" className="px-5 py-3 font-bold">Email</th>
                  <th scope="col" className="px-5 py-3 font-bold">What you&rsquo;ll see</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEAE0]">
                {ACCOUNTS.map((a) => (
                  <tr key={a.email} className="transition-colors hover:bg-[#FBF9F3]">
                    <td className="px-5 py-3">
                      <span className="inline-block rounded-full bg-[#F3EDDD] px-2.5 py-0.5 text-[12px] font-bold text-[#8a6d1f]">{a.role}</span>
                    </td>
                    <td className="px-5 py-3 font-mono text-[13px]">{a.email}</td>
                    <td className="px-5 py-3 text-[13px] text-[#6F6F6F]">{a.who}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <a
          href="/#/staff/login"
          className="mt-8 inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] text-base font-bold text-[#1A1A1A] shadow-[0_4px_12px_rgba(212,175,55,0.35)] transition-all hover:bg-[#C39B2A] active:scale-[0.98] sm:w-auto sm:px-8"
        >
          Continue to sign in <ArrowRight className="h-4 w-4" aria-hidden />
        </a>
        <p className="mt-4 text-[13px] leading-[1.6] text-[#8B8B8B]">
          These are sandbox accounts for the pilot. Production venues get real staff identities with per-venue credentials.
        </p>
      </main>

      <footer className="border-t border-[#EFEAE0] py-6 text-center text-[13px] text-[#8B8B8B]">
        © 2026 SeatServe · <a href="/" className="hover:text-[#1A1A1A]">Home</a> · Demo — no real payments are processed.
      </footer>
    </div>
>>>>>>> origin/main
  )
}
