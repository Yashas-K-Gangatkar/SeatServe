'use client'

// SeatServe — Team panel (admin board section): create and manage staff logins.
// Answers the owner question "how do I give a chef real access?": pick their
// store + role, hand them an email + password. No Google/Gmail is involved —
// the login ID is issued by the mall admin and the account is server-pinned
// to that one store (they can never see another store's screen).

import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Plus, RefreshCw, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { get, patch, post, ApiError } from '@/lib/client/api'
import { Spinner, LoadError, EmptyState } from '../ui-bits'

interface StaffRow {
  id: string
  name: string
  email: string | null
  phone: string
  role: string
  isActive: boolean
  storeName: string | null
  cinemaName: string | null
}

interface TeamData {
  staff: StaffRow[]
  cinemas: { id: string; name: string }[]
}

const ROLE_LABEL: Record<string, string> = {
  MALL_ADMIN: 'Mall admin',
  CINEMA_MANAGER: 'Cinema manager',
  STORE_MANAGER: 'Store manager',
  KITCHEN_STAFF: 'Kitchen staff',
  RUNNER: 'Runner',
}

const ROLE_HELP: Record<string, string> = {
  STORE_MANAGER: 'Runs one shop: menu, items, tickets',
  KITCHEN_STAFF: 'Kitchen screen for ONE shop only — nothing else',
  CINEMA_MANAGER: 'Screens, seats and QR sheets for one cinema',
}

/** Unambiguous 12-char password: letters + digits, no 0/O/1/l/I. */
function generatePassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length]
  const chars = Array.from({ length: 9 }, () => pick(letters)).concat([pick(digits), pick(digits), pick(letters)])
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

export default function TeamPanel({ stores }: { stores: { id: string; name: string; emoji: string | null }[] }) {
  const [data, setData] = useState<TeamData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [justCreated, setJustCreated] = useState<{ email: string; password: string } | null>(null)
  const [resetFor, setResetFor] = useState<{ id: string; name: string } | null>(null)
  const [resetPassword, setResetPassword] = useState('')

  const load = useCallback(async () => {
    try {
      setError(null)
      setData(await get<TeamData>('/api/admin/staff'))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load staff list')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const changeState = async (id: string, action: 'DEACTIVATE' | 'ACTIVATE', name: string) => {
    setBusy(true)
    try {
      const res = await patch<{ message: string }>(`/api/admin/staff/${id}`, { action })
      toast.success(res.message ?? `${name} updated`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed')
    } finally {
      setBusy(false)
      void load()
    }
  }

  const submitReset = async () => {
    if (!resetFor) return
    setBusy(true)
    try {
      const res = await patch<{ message: string }>(`/api/admin/staff/${resetFor.id}`, { action: 'SET_PASSWORD', password: resetPassword })
      toast.success(res.message ?? 'Password updated')
      setResetFor(null)
      setResetPassword('')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed')
    } finally {
      setBusy(false)
      void load()
    }
  }

  if (loading && !data) return <Spinner label="Loading team…" />
  if (error)
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <LoadError message={error} onRetry={load} />
      </div>
    )
  if (!data) return null

  return (
    <section className="mt-6 space-y-3" aria-label="Team logins">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
          <Users className="h-3.5 w-3.5" aria-hidden /> Team · logins &amp; access
        </h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-gradient-to-b from-amber-500 to-orange-500 px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm shadow-orange-500/30 transition hover:from-amber-600 hover:to-orange-600"
          aria-expanded={showForm}
        >
          <Plus className="mr-1 inline h-3 w-3" aria-hidden /> Add staff
        </button>
      </div>

      <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] leading-relaxed text-sky-900">
        Staff sign in with the <b>email + password you give them</b> — never Gmail, never Google. The email is just a work
        login ID you create here (it does not need to be a real mailbox; nothing is emailed to it). Each account is locked
        to its own store — a chef can only ever see their shop&apos;s kitchen screen.
      </p>

      {justCreated && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4" role="status">
          <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-800">
            <UserPlus className="h-4 w-4" aria-hidden /> Account created — share these credentials now
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm">
            <code className="font-bold">{justCreated.email}</code>
            <span className="text-muted-foreground">·</span>
            <code className="font-bold">{justCreated.password}</code>
            <span className="ml-auto flex items-center gap-1.5">
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(justCreated.email).then(
                    () => toast.success('Email copied — paste it into the TO box'),
                    () => toast.error('Copy failed — select the text manually'),
                  )
                }}
                className="rounded-full bg-stone-900 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-stone-800"
              >
                Copy email
              </button>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(justCreated.password).then(
                    () => toast.success('Password copied — paste it into the PASSWORD box (one tap, no retyping)'),
                    () => toast.error('Copy failed — select the text manually'),
                  )
                }}
                className="rounded-full bg-stone-900 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-stone-800"
              >
                Copy password
              </button>
              <button
                onClick={() => setJustCreated(null)}
                aria-label="Hide credentials"
                title="Hide — you can always reset the password instead"
                className="rounded-full border border-stone-300 bg-white px-2 py-1.5 text-[10px] font-bold text-stone-500 hover:bg-stone-50"
              >
                Done
              </button>
            </span>
          </div>
          <p className="mt-2 text-[11px] text-emerald-800">
            This is the ONE-TIME handover card — stored hashed, never shown again. Lost it? Use “Password” on the person’s
            row below to set a new one.
          </p>
        </div>
      )}

      {showForm && (
        <AddStaffForm
          stores={stores}
          cinemas={data.cinemas}
          busy={busy}
          setBusy={setBusy}
          onCreated={(email, password) => {
            setShowForm(false)
            setJustCreated({ email, password })
            void load()
          }}
        />
      )}

      {data.staff.length === 0 ? (
        <EmptyState title="No staff accounts yet" hint="Add your first chef or manager with the button above." />
      ) : (
        <ul className="space-y-2">
          {data.staff.map((s) => (
            <li key={s.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold">
                    {s.name}{' '}
                    <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      {ROLE_LABEL[s.role] ?? s.role}
                    </span>
                    {!s.isActive && (
                      <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">Disabled</span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {s.email ?? 'no login'} · {s.storeName ?? s.cinemaName ?? 'mall-wide'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => {
                      setResetFor({ id: s.id, name: s.name })
                      setResetPassword(generatePassword())
                    }}
                    className="rounded-full border border-border px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted"
                  >
                    <KeyRound className="mr-1 inline h-3 w-3" aria-hidden /> Password
                  </button>
                  {s.isActive ? (
                    <button
                      onClick={() => changeState(s.id, 'DEACTIVATE', s.name)}
                      disabled={busy}
                      className="rounded-full border border-red-300 bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      Disable
                    </button>
                  ) : (
                    <button
                      onClick={() => changeState(s.id, 'ACTIVATE', s.name)}
                      disabled={busy}
                      className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      Enable
                    </button>
                  )}
                </div>
              </div>
              {resetFor?.id === s.id && (
                <div className="mt-3 rounded-xl bg-background p-3">
                  <p className="text-[11px] font-bold">New password for {s.name}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      type="text"
                      autoComplete="off"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className="min-w-0 flex-1 rounded-xl border border-border bg-white px-3 py-2 font-mono text-sm"
                      aria-label="New password"
                    />
                    <button
                      onClick={() => setResetPassword(generatePassword())}
                      className="rounded-full border border-border px-3 py-2 text-[11px] font-bold text-muted-foreground hover:bg-muted"
                    >
                      <RefreshCw className="mr-1 inline h-3 w-3" aria-hidden /> Generate
                    </button>
                    <button
                      onClick={submitReset}
                      disabled={busy || resetPassword.length < 8}
                      className="rounded-full bg-stone-900 px-3 py-2 text-[11px] font-bold text-white hover:bg-stone-800 disabled:opacity-50"
                    >
                      Save &amp; sign them out
                    </button>
                    <button onClick={() => setResetFor(null)} className="text-[11px] font-bold text-muted-foreground hover:text-foreground">
                      Cancel
                    </button>
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    Saving signs them out of every device — share the new password in person or on a call.
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ─────────────────────────── add-staff form ───────────────────────────

function AddStaffForm({
  stores,
  cinemas,
  busy,
  setBusy,
  onCreated,
}: {
  stores: { id: string; name: string; emoji: string | null }[]
  cinemas: { id: string; name: string }[]
  busy: boolean
  setBusy: (v: boolean) => void
  onCreated: (email: string, password: string) => void
}) {
  const [name, setName] = useState('')
  const [role, setRole] = useState<'KITCHEN_STAFF' | 'STORE_MANAGER' | 'CINEMA_MANAGER'>('KITCHEN_STAFF')
  const [storeId, setStoreId] = useState(stores[0]?.id ?? '')
  const [cinemaId, setCinemaId] = useState(cinemas[0]?.id ?? '')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState(generatePassword())
  const [error, setError] = useState<string | null>(null)

  const inputCls =
    'w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-amber-400/40'
  const labelCls = 'mb-1 block text-[11px] font-bold text-muted-foreground'

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await post('/api/admin/staff', {
        name,
        role,
        email,
        phone,
        password,
        ...(role === 'CINEMA_MANAGER' ? { cinemaId } : { storeId }),
      })
      onCreated(email.toLowerCase(), password)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the account')
    } finally {
      setBusy(false)
    }
  }

  const valid = name.trim().length >= 2 && /.+@.+\..+/.test(email) && phone.replace(/[\s-]/g, '').length >= 10 && password.length >= 8

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-extrabold uppercase tracking-wider text-amber-800">New staff login</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="staff-name">Full name</label>
          <input id="staff-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ramesh K." className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="staff-role">Role</label>
          <select id="staff-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)} className={inputCls}>
            <option value="KITCHEN_STAFF">Kitchen staff (chef)</option>
            <option value="STORE_MANAGER">Store manager</option>
            <option value="CINEMA_MANAGER">Cinema manager</option>
          </select>
          <p className="mt-1 text-[10px] text-muted-foreground">{ROLE_HELP[role]}</p>
        </div>
        {role === 'CINEMA_MANAGER' ? (
          <div>
            <label className={labelCls} htmlFor="staff-cinema">Cinema</label>
            <select id="staff-cinema" value={cinemaId} onChange={(e) => setCinemaId(e.target.value)} className={inputCls}>
              {cinemas.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className={labelCls} htmlFor="staff-store">Store</label>
            <select id="staff-store" value={storeId} onChange={(e) => setStoreId(e.target.value)} className={inputCls}>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className={labelCls} htmlFor="staff-email">Login email (work ID — any name you like)</label>
          <input
            id="staff-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ramesh@wraphouse"
            className={inputCls}
            autoCapitalize="none"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="staff-phone">Mobile number</label>
          <input
            id="staff-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
            className={inputCls}
            inputMode="tel"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="staff-password">Password</label>
          <div className="flex items-center gap-2">
            <input
              id="staff-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={`${inputCls} font-mono`}
            />
            <button
              type="button"
              onClick={() => setPassword(generatePassword())}
              className="shrink-0 rounded-full border border-border px-3 py-2 text-[11px] font-bold text-muted-foreground hover:bg-muted"
            >
              <RefreshCw className="mr-1 inline h-3 w-3" aria-hidden /> Generate
            </button>
          </div>
        </div>
      </div>
      {error && <p className="mt-2 text-[11px] font-bold text-red-700" role="alert">{error}</p>}
      <button
        onClick={submit}
        disabled={busy || !valid}
        className="mt-3 w-full rounded-full bg-gradient-to-b from-amber-500 to-orange-500 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm shadow-orange-500/30 transition hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
      >
        Create login for {name.trim() || 'staff member'}
      </button>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        Letters + numbers, at least 8 characters. After creating, share the email + password privately — never on a
        notice board. You can reset the password or disable the account any time.
      </p>
    </div>
  )
}
