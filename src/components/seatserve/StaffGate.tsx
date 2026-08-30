'use client'

// SeatServe Phase 2 — StaffGate: wraps every staff console.
// loading → spinner · no session → sign-in card · wrong role → forbidden card
// · ok → render children with the session profile. The server enforces the
// same rules on every API call; this gate only shapes the UI.
import { ChefHat, LockKeyhole, ShieldAlert, LogIn } from 'lucide-react'
import { useStaffAuth, ROLE_LABELS, type StaffProfile } from '@/lib/client/auth'
import { Spinner } from './ui-bits'

type AnyStaffRole = StaffProfile['role']

// Generic over the allowed role union so `children` receives a NARROWED profile
// (e.g. roles={['MALL_ADMIN','CINEMA_MANAGER']} → user.role is exactly that union)
// instead of forcing cast at every call site.
export default function StaffGate<R extends AnyStaffRole = AnyStaffRole>({
  roles,
  go,
  consoleName,
  children,
}: {
  roles?: R[]
  go: (p: string) => void
  consoleName: string
  children: (user: StaffProfile & { role: R }) => React.ReactNode
}) {
  const { status, user } = useStaffAuth(roles as AnyStaffRole[] | undefined)

  if (status === 'loading') return <Spinner label="Checking your session…" />

  if (status === 'unauthenticated') {
    return (
      <div className="mx-auto w-full max-w-md px-4 pt-16">
        <div className="rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-xl shadow-amber-500/5">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <LockKeyhole className="h-7 w-7" aria-hidden />
          </span>
          <h1 className="mt-4 text-xl font-black tracking-tight text-stone-900">Staff sign-in required</h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            <b>{consoleName}</b> is part of the staff portal. Sign in with your work account — every console is scoped to
            your role and your store, cinema or mall.
          </p>
          <button
            onClick={() => go('#/staff/login')}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-amber-500 to-orange-500 px-5 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-orange-500/30 transition hover:from-amber-600 hover:to-orange-600"
          >
            <LogIn className="h-4 w-4" aria-hidden /> Go to staff login
          </button>
        </div>
      </div>
    )
  }

  if (status === 'forbidden' && user) {
    return (
      <div className="mx-auto w-full max-w-md px-4 pt-16">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center" role="alert">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600">
            <ShieldAlert className="h-7 w-7" aria-hidden />
          </span>
          <h1 className="mt-4 text-xl font-black tracking-tight text-stone-900">Wrong console for your role</h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-700">
            You are signed in as <b>{user.name}</b> ({ROLE_LABELS[user.role]}). <b>{consoleName}</b> is restricted to:{' '}
            {roles?.map((r) => ROLE_LABELS[r]).join(', ')}.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => go('#/staff')}
              className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50"
            >
              <ChefHat className="h-3.5 w-3.5" aria-hidden /> My staff home
            </button>
            <button
              onClick={() => go('#/staff/login')}
              className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-xs font-bold text-white hover:bg-stone-800"
            >
              Switch account
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'ok' && user) {
    // Sound: useStaffAuth only returns status 'ok' when user.role ∈ roles (checked
    // above at runtime), so user.role is exactly the narrowed union R.
    return <>{children(user as StaffProfile & { role: R })}</>
  }
  return null
}
