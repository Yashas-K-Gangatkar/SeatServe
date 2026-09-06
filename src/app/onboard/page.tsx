'use client'

// /onboard — SELF-SERVE campus onboarding wizard.
// A college admin fills one form → NotiFetch stands up the whole campus:
// block, classrooms (each with a door-QR sticker), canteen store, and the
// block-manager login. Money stays gated behind KYC verification.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { post } from '@/lib/client/api'
import { GraduationCap, Printer, CheckCircle2, QrCode } from 'lucide-react'

interface OnboardResult {
  campusId: string
  campusName: string
  blockId: string
  blockName: string
  storeId: string
  manager: { login: string; name: string; role: string }
  classrooms: { id: string; name: string; doorQrToken: string; seats: number }[]
  orderUrl: string
}

const input =
  'mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-amber-300'
const label = 'block text-xs font-bold uppercase tracking-wider text-muted-foreground'

export default function OnboardPage() {
  const [form, setForm] = useState({
    campusName: '',
    city: 'Bengaluru',
    blockName: 'Science Block',
    classrooms: 10,
    storeName: 'Campus Canteen',
    adminName: '',
    adminEmail: '',
    adminPhone: '',
    password: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<OnboardResult | null>(null)

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: k === 'classrooms' ? Math.max(1, Math.min(40, Number(e.target.value) || 1)) : e.target.value }))

  const valid = useMemo(
    () =>
      form.campusName.trim().length >= 3 &&
      form.city.trim().length >= 2 &&
      form.blockName.trim().length >= 2 &&
      form.storeName.trim().length >= 2 &&
      form.adminName.trim().length >= 2 &&
      /.+@.+\..+/.test(form.adminEmail.trim()) &&
      /^\d{10}$/.test(form.adminPhone.trim()) &&
      form.password.length >= 8,
    [form],
  )

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await post<OnboardResult>('/api/onboard/campus', {
        campusName: form.campusName.trim(),
        city: form.city.trim(),
        blockName: form.blockName.trim(),
        classrooms: form.classrooms,
        seatRows: 6,
        seatCols: 6,
        storeName: form.storeName.trim(),
        adminName: form.adminName.trim(),
        adminEmail: form.adminEmail.trim(),
        adminPhone: form.adminPhone.trim(),
        password: form.password,
      })
      setResult(r)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the campus')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-dvh bg-gradient-to-b from-amber-50 to-orange-50 px-4 py-8">
      <div className="mx-auto max-w-lg">
        <header className="mb-6 text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-amber-700">
            <GraduationCap className="h-3.5 w-3.5" aria-hidden /> NotiFetch for campuses
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-stone-900">
            {result ? 'Your campus is live 🎉' : 'Put your college on NotiFetch'}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {result
              ? 'One block, up and running. Paste the door QR stickers, share the login with the canteen, and students can order from the next class.'
              : 'One form: your block, its classrooms, and the canteen. Students scan the QR outside a classroom, order during class, and food lands at the door when the bell rings.'}
          </p>
        </header>

        {result ? (
          <section className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm" aria-label="Onboarding result">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" aria-hidden />
              <p className="text-sm font-extrabold">{result.campusName} · {result.blockName}</p>
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex items-center justify-between gap-2 rounded-xl bg-stone-50 px-3 py-2">
                <span className="text-muted-foreground">Classrooms with door QR</span>
                <span className="font-bold tabular">{result.classrooms.length}</span>
              </li>
              <li className="flex items-center justify-between gap-2 rounded-xl bg-stone-50 px-3 py-2">
                <span className="text-muted-foreground">Canteen manager login (email)</span>
                <span className="truncate font-bold">{result.manager.login}</span>
              </li>
              <li className="rounded-xl bg-stone-50 px-3 py-2">
                <span className="text-muted-foreground">Staff portal</span>
                <p className="mt-0.5 font-bold">notifetch.in/staff → sign in with the email + your password</p>
              </li>
            </ul>
            <div className="mt-5 flex flex-col gap-2">
              <Link
                href={`/onboard/print?blockId=${result.blockId}`}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-sm font-extrabold text-white hover:bg-orange-700"
              >
                <Printer className="h-4 w-4" aria-hidden /> Print door QR stickers
              </Link>
              <a
                href={result.orderUrl}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-3 text-sm font-extrabold text-stone-800 hover:bg-stone-50"
              >
                <QrCode className="h-4 w-4" aria-hidden /> Try a classroom page
              </a>
            </div>
            <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Payments unlock after the canteen completes KYC in the staff portal (campus admin verifies it). Until then students can browse menus without paying.
            </p>
          </section>
        ) : (
          <section className="rounded-3xl border border-amber-200 bg-white p-6 shadow-sm" aria-label="Campus onboarding form">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className={label} htmlFor="campusName">College / university name</label>
                <input id="campusName" className={input} value={form.campusName} onChange={set('campusName')} placeholder="Nova Degree College" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label} htmlFor="city">City</label>
                  <input id="city" className={input} value={form.city} onChange={set('city')} />
                </div>
                <div>
                  <label className={label} htmlFor="blockName">Block</label>
                  <input id="blockName" className={input} value={form.blockName} onChange={set('blockName')} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label} htmlFor="classrooms">Classrooms in this block</label>
                  <input id="classrooms" type="number" min={1} max={40} className={input} value={form.classrooms} onChange={set('classrooms')} />
                </div>
                <div>
                  <label className={label} htmlFor="storeName">Canteen / stall name</label>
                  <input id="storeName" className={input} value={form.storeName} onChange={set('storeName')} />
                </div>
              </div>
              <div>
                <label className={label} htmlFor="adminName">Your name</label>
                <input id="adminName" className={input} value={form.adminName} onChange={set('adminName')} placeholder="Prof. Rao" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label} htmlFor="adminEmail">Your email (this becomes the login)</label>
                  <input id="adminEmail" type="email" className={input} value={form.adminEmail} onChange={set('adminEmail')} placeholder="rao@college.edu" />
                </div>
                <div>
                  <label className={label} htmlFor="adminPhone">Mobile number</label>
                  <input id="adminPhone" inputMode="numeric" className={input} value={form.adminPhone} onChange={set('adminPhone')} placeholder="10-digit mobile" />
                </div>
              </div>
              <div>
                <label className={label} htmlFor="password">Password</label>
                <input id="password" type="password" className={input} value={form.password} onChange={set('password')} placeholder="min 8 characters" />
              </div>
            </div>
            {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}
            <button
              onClick={submit}
              disabled={busy || !valid}
              className="mt-5 w-full rounded-xl bg-orange-600 px-4 py-3.5 text-sm font-extrabold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Setting up your campus…' : 'Create my campus — free'}
            </button>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              6×6 seats per classroom by default · every classroom gets its own door QR · staff portal included
            </p>
          </section>
        )}
      </div>
    </main>
  )
}
