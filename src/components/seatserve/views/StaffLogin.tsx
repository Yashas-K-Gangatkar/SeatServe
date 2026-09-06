'use client'

// NotiFetch — staff portal login (#/staff/login).
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

// Human copy for the failure slugs /api/auth/google* bounces back with
// (?gerr=… on the hash). Everything maps to guidance, never a raw code.
const GOOGLE_ERRORS: Record<string, string> = {
  no_account: 'This Google account is not registered as staff. Ask your manager to add this exact Gmail in the Team panel.',
  deactivated: 'This account is deactivated — contact your campus admin.',
  not_staff: 'This account is not a staff account.',
  state_mismatch: 'Sign-in link expired — start again.',
  exchange_failed: 'Google sign-in failed — try again, or use email and password.',
  profile_failed: 'Could not read your Google profile — try again.',
  email_unverified: 'Your Google email is not verified — verify it in Gmail settings first.',
  email_missing: 'Your Google account has no email — use email and password.',
  not_configured: 'Google sign-in is not configured yet — use email and password.',
}

export default function StaffLogin({ go }: { go: (p: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [googleReady, setGoogleReady] = useState(false)

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

  useEffect(() => {
    // Does this deployment have Google sign-in configured? Hide the button
    // entirely when not — never show a dead door.
    void (async () => {
      try {
        const res = await fetch('/api/auth/providers', { cache: 'no-store' })
        const json = (await res.json()) as { ok: boolean; data?: { google?: boolean } }
        if (json.ok && json.data?.google) setGoogleReady(true)
      } catch {
        /* password form still works */
      }
    })()
    // OAuth callback bounces land on #/staff/login?gerr=<slug>
    const hash = window.location.hash
    const slug = new URLSearchParams(hash.split('?')[1] ?? '').get('gerr')
    if (slug) {
      setErr(GOOGLE_ERRORS[slug] ?? 'Google sign-in failed — use email and password.')
      if (history.replaceState) {
        const clean = hash.split('?')[0]
        history.replaceState(null, '', `${window.location.pathname}${clean}`)
      }
    }
  }, [])

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
        <p className="mt-4 text-[11px] font-extrabold tracking-[0.18em] text-orange-600">NOTIFETCH STAFF PORTAL</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-900">Sign in to your console</h1>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          One platform, scoped views. Kitchen staff see only their store&apos;s tickets; runners their own runs; block
          managers their own classrooms; the campus admin the whole campus.
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
            {googleReady && (
              <>
                <div className="flex items-center gap-3 pt-1" aria-hidden>
                  <span className="h-px flex-1 bg-stone-200" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">or</span>
                  <span className="h-px flex-1 bg-stone-200" />
                </div>
                <a
                  href="/api/auth/google"
                  className="inline-flex items-center justify-center gap-2.5 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-bold text-stone-700 shadow-sm transition hover:border-stone-400 hover:bg-stone-50"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
                    <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.2 3.7-8.6z" />
                    <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.1 0-5.8-2.1-6.8-5l-3.8 3C3.3 21.3 7.3 24 12 24z" />
                    <path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-3.9-3C.5 8.2 0 10 0 12s.5 3.8 1.3 5.4l3.9-3z" />
                    <path fill="#EA4335" d="M12 4.7c2.2 0 3.7.9 4.5 1.7l3.3-3.2C17.9 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.3 6.6l3.9 3c1-2.9 3.7-4.9 6.8-4.9z" />
                  </svg>
                  Sign in with Google
                </a>
              </>
            )}
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
