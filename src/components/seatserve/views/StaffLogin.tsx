'use client'

// SeatServe — staff portal login (#/staff/login).
// A deliberately separate experience from the customer app: work identity,
// scoped access. Accounts are issued by the venue administrator — no demo
// shortcuts are shown on a live platform.
import { useEffect, useState } from 'react'
import { ChevronLeft, LockKeyhole, LogIn, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/client/api'
import { login, ROLE_LABELS, type StaffProfile } from '@/lib/client/auth'
import { Spinner } from '../ui-bits'
import { WarmBackdrop } from '../WarmBackdrop'

export default function StaffLogin({ go }: { go: (p: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  // An already-signed-in staff member landing here goes straight to the portal.
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' })
        const json = (await res.json()) as { ok: boolean; data?: StaffProfile }
        if (alive && json.ok && json.data) {
          toast.success(`Welcome back, ${json.data.name}`, {
            description: `${ROLE_LABELS[json.data.role]} · scoped console`,
          })
          go('#/staff')
        }
      } catch {
        /* not signed in — show the form */
      } finally {
        if (alive) setChecking(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [go])

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const me = await login(email.trim(), password)
      toast.success(`Welcome back, ${me.name}`, { description: `${ROLE_LABELS[me.role]} · scoped console` })
      go('#/staff')
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0
      setErr(
        status === 401
          ? 'Invalid email or password. Check with your venue administrator if you are unsure.'
          : error instanceof ApiError
            ? error.message
            : 'Sign-in failed — try again',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16 pt-6">
      <WarmBackdrop />
      <button onClick={() => go('#/')} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Customer app
      </button>

      <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-xl shadow-orange-500/5 sm:p-8">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-orange-500/25">
          <LockKeyhole className="h-7 w-7" aria-hidden />
        </span>
        <p className="mt-4 text-[11px] font-extrabold tracking-[0.18em] text-orange-600">SEATSERVE STAFF PORTAL</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-900">Sign in to your console</h1>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          One platform, scoped views. Kitchen staff see only their store&apos;s tickets; runners their own runs; cinema
          managers their own screens; the mall admin the whole mall.
        </p>

        {checking ? (
          <Spinner label="Restoring session…" />
        ) : (
          <form onSubmit={submit} className="mt-6 grid gap-4">
            <div>
              <label htmlFor="staff-email" className="mb-1.5 block text-xs font-bold text-stone-700">Work email</label>
              <input
                id="staff-email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourvenue.in"
                className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-200"
              />
            </div>
            <div>
              <label htmlFor="staff-password" className="mb-1.5 block text-xs font-bold text-stone-700">Password</label>
              <input
                id="staff-password"
                type="password"
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-200"
              />
            </div>
            {err && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700" role="alert">
                {err}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-amber-500 to-orange-500 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-orange-500/25 transition hover:from-amber-600 hover:to-orange-600 disabled:opacity-60"
            >
              <LogIn className="h-4 w-4" aria-hidden /> {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
      </div>

      <p className="mt-5 flex items-start gap-2 text-[11px] leading-relaxed text-stone-500">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
        Sessions are encrypted httpOnly cookies; passwords are never stored in
        plain text; every sign-in is rate-limited and audited. No account yet?
        Your venue administrator creates one in the Admin → Team panel.
      </p>
    </div>
  )
}
