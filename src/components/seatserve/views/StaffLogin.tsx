'use client'

// SeatServe Phase 2 — staff portal login (#/staff/login).
// A deliberately separate experience from the customer app: work identity,
// scoped access, demo chips for one-tap sign-in during the sandbox demo.
import { useState } from 'react'
import { ChevronLeft, LockKeyhole, LogIn, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/client/api'
import { login, ROLE_LABELS, type StaffProfile } from '@/lib/client/auth'
import { Spinner } from '../ui-bits'

const DEMO_ACCOUNTS: { email: string; role: StaffProfile['role']; who: string }[] = [
  { email: 'asha@seatserve.demo', role: 'MALL_ADMIN', who: 'Aurora Mall · oversees all 4 stores' },
  { email: 'vikram@aurora.demo', role: 'CINEMA_MANAGER', who: 'Aurora Cineplex Wing A · own cinema only' },
  { email: 'kitchen@cinema-snacks.demo', role: 'KITCHEN_STAFF', who: 'Cinema Snacks counter' },
  { email: 'kitchen@pizza-corner.demo', role: 'KITCHEN_STAFF', who: 'Pizza Corner kitchen' },
  { email: 'kitchen@wrap-house.demo', role: 'KITCHEN_STAFF', who: 'Wrap House kitchen' },
  { email: 'kitchen@mithai-more.demo', role: 'KITCHEN_STAFF', who: 'Mithai & More counter' },
  { email: 'manager@cinema-snacks.demo', role: 'STORE_MANAGER', who: 'Cinema Snacks · store controls' },
  { email: 'ravi@runner.demo', role: 'RUNNER', who: 'Ravi · Wing A zone' },
  { email: 'sana@runner.demo', role: 'RUNNER', who: 'Sana · Wing B zone' },
]
const DEMO_PASSWORD = 'demo1234'

export default function StaffLogin({ go }: { go: (p: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const me = await login(email.trim(), password)
      toast.success(`Welcome back, ${me.name}`, { description: `${ROLE_LABELS[me.role]} · scoped console` })
      go('#/staff')
    } catch (error) {
      // the #1 real-world login failure: typing a gmail-style address — the
      // demo emails are @seatserve.demo / @aurora.demo etc. Make the recovery
      // obvious instead of a bare 401.
      const status = error instanceof ApiError ? error.status : 0
      setErr(
        status === 401
          ? 'Invalid email or password. Demo tip: these are NOT Gmail addresses — tap a role chip below to fill the exact email, then sign in (password: demo1234).'
          : error instanceof ApiError
            ? error.message
            : 'Sign-in failed — try again',
      )
    } finally {
      setBusy(false)
    }
  }

  const fill = (demoEmail: string) => {
    setEmail(demoEmail)
    setPassword(DEMO_PASSWORD)
    setErr(null)
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16 pt-6">
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
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourstore.demo"
                className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-200"
              />
            </div>
            <div>
              <label htmlFor="staff-password" className="mb-1.5 block text-xs font-bold text-stone-700">Password</label>
              <input
                id="staff-password"
                type="password"
                autoComplete="current-password"
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

        {/* demo chips */}
        <div className="mt-6 border-t border-stone-200 pt-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Demo accounts · tap to fill</p>
          <p className="mt-1 text-[11px] text-stone-500">Password for every demo account: <code className="rounded bg-stone-100 px-1.5 py-0.5 font-bold text-stone-700">demo1234</code></p>
          <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto pr-1">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => fill(a.email)}
                className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-left transition hover:border-orange-300 hover:bg-orange-50"
              >
                <span>
                  <span className="block text-xs font-bold text-stone-800">{ROLE_LABELS[a.role]}</span>
                  <span className="block text-[11px] text-stone-500">{a.who}</span>
                </span>
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-stone-500 ring-1 ring-stone-200">{a.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* lawyer-hat disclosure */}
      <p className="mt-5 flex items-start gap-2 text-[11px] leading-relaxed text-stone-500">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
        Sandbox demo: sessions are httpOnly cookies; passwords are scrypt-hashed. Never enter real personal or payment
        credentials — payments remain mocked until Phase 3 provider integration.
      </p>
    </div>
  )
}
