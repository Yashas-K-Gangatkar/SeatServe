'use client'

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

export default function StaffPage() {
  const [copied, setCopied] = useState(false)

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
  )
}
