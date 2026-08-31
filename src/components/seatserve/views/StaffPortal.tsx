'use client'

// SeatServe Phase 2 — staff portal hub (#/staff).
// Post-login landing: shows ONLY the consoles this role may open, with the
// tenant scope spelled out (mall / cinema / store). Sign-out + demo reset
// (mall admin only) live here.
import { useState } from 'react'
import { ChefHat, Bike, LayoutDashboard, ScanLine, LogOut, RotateCcw, Building2, Store as StoreIcon, Clapperboard, ChevronLeft, UtensilsCrossed } from 'lucide-react'
import { toast } from 'sonner'
import { post } from '@/lib/client/api'
import { logout, ROLE_LABELS, useStaffAuth, type StaffProfile } from '@/lib/client/auth'
import { Spinner } from '../ui-bits'

interface ConsoleCard {
  href: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  sub: string
  tint: string
}

function consolesFor(user: StaffProfile): ConsoleCard[] {
  switch (user.role) {
    case 'MALL_ADMIN':
      return [
        { href: '#/admin', icon: LayoutDashboard, title: 'Mall admin board', sub: 'Every store in your mall: live orders, KPIs, settlement, audit', tint: 'text-amber-600 bg-amber-100' },
        { href: '#/menu', icon: UtensilsCrossed, title: 'Menu manager', sub: 'Any store in your mall: create items, set prices, mark items out of stock', tint: 'text-teal-600 bg-teal-100' },
        { href: '#/qr', icon: ScanLine, title: 'Seat QR generator', sub: 'Printable QR sheets for every screen in your mall', tint: 'text-rose-600 bg-rose-100' },
        { href: '#/kitchen', icon: ChefHat, title: 'Any kitchen (supervise)', sub: 'Open any store\u2019s kitchen console inside your mall', tint: 'text-violet-600 bg-violet-100' },
      ]
    case 'CINEMA_MANAGER':
      return [
        { href: '#/admin', icon: LayoutDashboard, title: 'Cinema board', sub: 'Live orders & KPIs for YOUR cinema only — other cinemas are invisible', tint: 'text-amber-600 bg-amber-100' },
        { href: '#/qr', icon: ScanLine, title: 'Seat QR generator', sub: 'Your cinema\u2019s screens only', tint: 'text-rose-600 bg-rose-100' },
      ]
    case 'STORE_MANAGER':
      return [
        { href: '#/kitchen', icon: ChefHat, title: 'Your store kitchen', sub: 'Tickets, accept → prepare → ready, open/close your store', tint: 'text-violet-600 bg-violet-100' },
        { href: '#/menu', icon: UtensilsCrossed, title: 'Your menu', sub: 'Create new items, set prices, mark items out of stock', tint: 'text-teal-600 bg-teal-100' },
        { href: '#/admin', icon: LayoutDashboard, title: 'Store performance', sub: 'Your store\u2019s live orders and settlement share (mall view, your rows)', tint: 'text-amber-600 bg-amber-100' },
      ]
    case 'KITCHEN_STAFF':
      return [
        { href: '#/kitchen', icon: ChefHat, title: 'Kitchen tickets', sub: 'ONLY your store\u2019s tickets arrive here — store isolation is enforced server-side', tint: 'text-violet-600 bg-violet-100' },
      ]
    case 'RUNNER':
      return [
        { href: '#/runner', icon: Bike, title: 'Runner console', sub: 'Ready pickups → pick up → deliver to screen & seat. Your runs only.', tint: 'text-emerald-600 bg-emerald-100' },
      ]
    default:
      return []
  }
}

function ScopeBadge({ user }: { user: StaffProfile }) {
  const map: Record<StaffProfile['role'], { icon: React.ComponentType<{ className?: string }>; label: string }> = {
    MALL_ADMIN: { icon: Building2, label: 'Scope: entire mall' },
    CINEMA_MANAGER: { icon: Clapperboard, label: 'Scope: your cinema' },
    STORE_MANAGER: { icon: StoreIcon, label: 'Scope: your store' },
    KITCHEN_STAFF: { icon: ChefHat, label: 'Scope: your store\u2019s kitchen' },
    RUNNER: { icon: Bike, label: 'Scope: your delivery runs' },
  }
  const { icon: Icon, label } = map[user.role]
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-bold text-orange-700">
      <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
    </span>
  )
}

export default function StaffPortal({ go }: { go: (p: string) => void }) {
  const { status, user, refresh } = useStaffAuth()
  const [resetting, setResetting] = useState(false)

  const signOut = async () => {
    await logout()
    toast.success('Signed out')
    go('#/staff/login')
  }

  const resetDemo = async () => {
    setResetting(true)
    try {
      await post('/api/simulator/reset')
      toast.success('Demo data reset', { description: 'Seed restored. You have been signed out — sign in again.' })
      await logout()
      go('#/staff/login')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setResetting(false)
      void refresh()
    }
  }

  if (status === 'loading') return <Spinner label="Loading staff portal…" />

  if (status === 'unauthenticated' || !user) {
    // not signed in — bounce to login (user-initiated visit to #/staff)
    if (typeof window !== 'undefined') window.location.hash = '#/staff/login'
    return <Spinner label="Redirecting to sign-in…" />
  }

  const cards = consolesFor(user)

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => go('#/')} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Customer app
        </button>
        <button
          onClick={signOut}
          className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3.5 py-1.5 text-xs font-bold text-stone-700 shadow-sm transition hover:border-red-300 hover:text-red-600"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out
        </button>
      </div>

      <header className="rounded-3xl border border-stone-200 bg-white p-6 shadow-xl shadow-orange-500/5">
        <p className="text-[11px] font-extrabold tracking-[0.18em] text-orange-600">SEATSERVE STAFF PORTAL</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-900">{user.name}</h1>
        <p className="mt-0.5 text-sm text-stone-500">
          {ROLE_LABELS[user.role]} · <span className="font-semibold text-stone-700">{user.email}</span>
        </p>
        <div className="mt-3"><ScopeBadge user={user} /></div>
        <p className="mt-3 text-xs leading-relaxed text-stone-500">
          Your role decides what loads here. Scoping is enforced on the server for every API call — opening someone
          else&apos;s store, cinema or run by URL returns 403, not just a hidden button.
        </p>
      </header>

      <section className="mt-6" aria-label="Your consoles">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">Your consoles</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map((c) => (
            <a
              key={c.href}
              href={c.href}
              className="group relative overflow-hidden rounded-2xl border border-stone-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-lg hover:shadow-orange-500/10"
            >
              <div className="flex items-start justify-between gap-3">
                <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${c.tint} transition group-hover:scale-105`}>
                  <c.icon className="h-5.5 w-5.5" aria-hidden />
                </span>
                <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] font-bold tracking-wider text-stone-500">
                  OPEN
                </span>
              </div>
              <h3 className="mt-3 font-bold text-stone-900">{c.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-stone-500">{c.sub}</p>
            </a>
          ))}
        </div>
      </section>

      {user.role === 'STORE_MANAGER' && user.storeId && <KycCard storeId={user.storeId} />}

      {user.role === 'MALL_ADMIN' && (
        <section className="mt-8 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-bold">Demo maintenance</h2>
          <p className="mt-1 text-xs text-stone-500">Wipes and reseeds the dataset (1 mall, 2 cinemas, 4 stores, 2 sample orders). All staff sessions are revoked.</p>
          <button
            onClick={resetDemo}
            disabled={resetting}
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-bold text-stone-700 shadow-sm transition hover:border-stone-400 hover:bg-stone-50 disabled:opacity-50"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${resetting ? 'animate-spin' : ''}`} aria-hidden />
            {resetting ? 'Resetting…' : 'Reset demo data'}
          </button>
        </section>
      )}
    </div>
  )
}

// Phase 4 — merchant KYC submission (store onboarding). Only MASKED compliance
// values are collected; the mall admin verifies before any payout can happen.
function KycCard({ storeId }: { storeId: string }) {
  const [gstin, setGstin] = useState('27AABCU9603R1ZM')
  const [pan, setPan] = useState('ABCPA1234F')
  const [bank, setBank] = useState('4821')
  const [fssai, setFssai] = useState('10023456789012')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    try {
      const res = await post<{ kycStatus: string }>(`/api/stores/${storeId}/kyc`, { gstin, panMasked: pan, bankMasked: bank, fssai })
      setStatus(res.kycStatus)
      toast.success('KYC submitted', { description: 'The mall admin reviews and verifies before payouts unlock.' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'KYC submission failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-5" aria-label="KYC onboarding">
      <h2 className="font-bold">Merchant KYC · payout onboarding</h2>
      <p className="mt-1 text-xs leading-relaxed text-stone-500">
        Settle-up requires verified compliance details. Only masked values are stored — the platform never keeps raw bank or PAN numbers.
        {status && <span className="ml-1 font-bold text-orange-600">Current status: {status}</span>}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="GSTIN (15 chars)" aria-label="GSTIN" className="rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-200" />
        <input value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} placeholder="PAN (10 chars)" aria-label="PAN" className="rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-200" />
        <input value={bank} onChange={(e) => setBank(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Bank a/c last 4" aria-label="Bank account last 4 digits" className="rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-200" />
        <input value={fssai} onChange={(e) => setFssai(e.target.value.replace(/\D/g, '').slice(0, 14))} placeholder="FSSAI (14 digits)" aria-label="FSSAI license" className="rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-200" />
      </div>
      <button
        onClick={submit}
        disabled={busy}
        className="mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-amber-500 to-orange-500 px-4 py-2 text-xs font-extrabold text-white shadow-md shadow-orange-500/25 transition hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
      >
        {busy ? 'Submitting…' : 'Submit KYC for review'}
      </button>
    </section>
  )
}
