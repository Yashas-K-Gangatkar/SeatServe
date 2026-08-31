'use client'

/**
 * /staff — staff sign-in entry point feeding the in-app sign-in console
 * (#/staff/login). The pilot account directory is GATED: it is only revealed
 * after entering the pilot access code, which the venue distributes privately.
 * Before this gate the page publicly listed staff emails and the shared
 * password — unacceptable once real payments flow.
 */
import { useState, useSyncExternalStore } from 'react'
import { Check, ClipboardCopy, Lock, LogIn, ShieldCheck } from 'lucide-react'
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

const DIR_KEY = 'notifetch.staffdir'
const DIR_CHANGE = 'notifetch:staffdir-change'
/** Pilot access code — rotate together with the staff password on go-live. */
const ACCESS_CODE = 'demo1234'

function subscribeDir(onChange: () => void): () => void {
  window.addEventListener('storage', onChange)
  window.addEventListener(DIR_CHANGE, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(DIR_CHANGE, onChange)
  }
}

function getDirSnapshot(): boolean {
  try {
    return localStorage.getItem(DIR_KEY) === 'ok'
  } catch {
    return false
  }
}

function getDirServerSnapshot(): boolean {
  return false
}

export default function StaffPage() {
  // Server HTML and hydrated render agree (locked); the stored unlock, if
  // any, is applied through the external-store snapshot after hydration.
  const unlocked = useSyncExternalStore(subscribeDir, getDirSnapshot, getDirServerSnapshot)
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState(false)

  const unlock = () => {
    if (code.trim() === ACCESS_CODE) {
      try {
        localStorage.setItem(DIR_KEY, 'ok')
      } catch {
        /* storage unavailable — the event still re-renders this tab */
      }
      window.dispatchEvent(new Event(DIR_CHANGE))
      setError(false)
    } else {
      setError(true)
    }
  }

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(ACCESS_CODE)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <AuxPage wide>
      <h1 className="text-[32px] font-bold tracking-tight sm:text-[44px]">
        Staff sign-in
      </h1>
      <p className="mt-2 max-w-xl text-base leading-[1.6] text-[#6F6F6F]">
        Venue staff sign in to a console scoped to just their own store, zone or
        venue. Credentials are issued by the venue manager.
      </p>

      <div className="mt-8 flex flex-col items-start gap-4">
        <a
          href="/#/staff/login"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-6 text-[15px] font-bold text-[#1A1A1A] shadow-[0_4px_12px_rgba(212,175,55,0.35)] transition-all hover:scale-[1.02] hover:bg-[#C39B2A] active:scale-[0.98]"
        >
          <LogIn className="h-4 w-4" aria-hidden />
          Continue to sign in
        </a>
      </div>

      {!unlocked ? (
        <div className="mt-10 max-w-md rounded-2xl border border-[#E7E2D8] bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.06)]">
          <p className="inline-flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-wider text-[#8a6d1f]">
            <Lock className="h-4 w-4" aria-hidden />
            Pilot account directory
          </p>
          <p className="mt-3 text-sm leading-[1.6] text-[#6F6F6F]">
            The list of pilot accounts is only for venue staff and pilot
            testers. Enter the pilot access code you were given to view it.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <input
              type="password"
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                setError(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') unlock()
              }}
              placeholder="Access code"
              aria-label="Pilot access code"
              className={`h-11 w-full rounded-xl border bg-[#FBF9F3] px-4 text-sm font-semibold text-[#1A1A1A] outline-none transition focus:ring-2 focus:ring-[#D4AF37]/40 ${error ? 'border-red-400' : 'border-[#E7E2D8]'}`}
            />
            <button
              type="button"
              onClick={unlock}
              className="h-11 shrink-0 rounded-xl bg-[#1A1A1A] px-5 text-sm font-bold text-white transition hover:bg-black active:scale-[0.98]"
            >
              Unlock
            </button>
          </div>
          {error && (
            <p className="mt-2 text-[13px] font-semibold text-red-600">
              That code doesn’t match. Ask the venue manager for the current one.
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="mt-10 inline-flex items-center gap-2 rounded-lg bg-[#F3EDDD] px-3 py-1.5 text-[13px] font-semibold text-[#8a6d1f]">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Pilot password for these accounts:
            <code className="rounded bg-white px-1.5 py-0.5 font-black tracking-wide text-[#1A1A1A]">
              {ACCESS_CODE}
            </code>
            <button
              type="button"
              onClick={() => void copyPassword()}
              aria-label="Copy pilot password"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-[#D4AF37]/20"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
          </p>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-[#E7E2D8] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.06)]">
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

          <p className="mt-6 max-w-xl text-[13px] leading-[1.6] text-[#8B8B8B]">
            These are pilot accounts. On go-live the shared password is rotated
            and every venue gets real staff identities with per-venue
            credentials.
          </p>
        </>
      )}
    </AuxPage>
  )
}
