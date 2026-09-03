'use client'

// SeatServe — kitchen dashboard (#/kitchen/<storeId> | #/kitchen to pick a store)
// Realtime paid tickets (socket.io + polling fallback), chime on new tickets,
// status flow NEW → ACCEPTED → PREPARING → READY_FOR_PICKUP, allergy highlights,
// busy-mode overload control, open/close store.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, BellOff, ChevronLeft, Flame, Store as StoreIcon, Volume2 } from 'lucide-react'
import { toast } from 'sonner'
import { get, post, patch, ApiError } from '@/lib/client/api'
import { useRealtime, usePolling, useOnline, armAudio, playChime } from '@/lib/client/realtime'
import type { KitchenResponse, KitchenTicket } from '@/lib/client/types'
import type { StaffProfile } from '@/lib/client/auth'
import StaffGate from '../StaffGate'
import { rupees, timeHM, minAgo, StatusPill, LiveDot, Spinner, LoadError, EmptyState } from '../ui-bits'

interface StoreLite {
  id: string
  name: string
  slug: string
  emoji: string | null
  tagline: string | null
  isOpen: boolean
  kycStatus: string
}

const NEXT_ACTION: Record<string, { to: string; label: string }> = {
  NEW: { to: 'ACCEPTED', label: 'Accept ticket' },
  ACCEPTED: { to: 'PREPARING', label: 'Start preparing' },
  PREPARING: { to: 'READY_FOR_PICKUP', label: 'Ready for pickup' },
}

export default function Kitchen({ storeId, go, onRouteChange }: { storeId?: string; go: (p: string) => void; onRouteChange?: () => void }) {
  return (
    <StaffGate roles={['KITCHEN_STAFF', 'STORE_MANAGER', 'MALL_ADMIN', 'CINEMA_MANAGER']} go={go} consoleName="Kitchen console">
      {(user) => <KitchenPicker user={user} storeId={storeId} go={go} onRouteChange={onRouteChange} />}
    </StaffGate>
  )
}

function KitchenPicker({ user, storeId, go, onRouteChange }: { user: StaffProfile; storeId?: string; go: (p: string) => void; onRouteChange?: () => void }) {
  // Phase 2: store staff are PINNED to their own store by the session — a URL
  // pointing at another store cannot widen their view (server enforces 403 too).
  const pinned = user.role !== 'MALL_ADMIN' ? (user.storeId ?? undefined) : undefined
  const effective = pinned ?? storeId ?? undefined

  const [stores, setStores] = useState<StoreLite[] | null>(null)

  useEffect(() => {
    if (effective) return
    void get<StoreLite[]>('/api/stores')
      .then(setStores)
      .catch(() => setStores([]))
  }, [effective])

  if (!effective) {
    // only MALL_ADMIN reaches the picker
    return (
      <div className="mx-auto w-full max-w-md px-4 pb-16 pt-6">
        <button onClick={() => go('#/')} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Demo home
        </button>
        <h1 className="text-2xl font-black tracking-tight">Which kitchen?</h1>
        <p className="mt-1 text-sm text-muted-foreground">Mall-admin supervision view — pick any store in your mall. Store staff skip this screen entirely.</p>
        {stores === null ? (
          <Spinner />
        ) : (
          <div className="mt-4 grid gap-3">
            {stores.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  go(`#/kitchen/${s.slug}`)
                  onRouteChange?.()
                }}
                className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:border-amber-300 hover:shadow-md hover:shadow-amber-500/10"
              >
                <span className="text-2xl" aria-hidden>{s.emoji}</span>
                <span className="flex-1">
                  <span className="block font-bold">{s.name}</span>
                  <span className="block text-[11px] text-muted-foreground">{s.tagline}</span>
                </span>
                <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${s.kycStatus === 'VERIFIED' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-300 bg-amber-50 text-amber-800'}`}>
                  KYC {s.kycStatus}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }
  return <KitchenDashboard storeSlugOrId={effective} canSwitch={user.role === 'MALL_ADMIN' || user.role === 'CINEMA_MANAGER'} go={go} />
}

function KitchenDashboard({ storeSlugOrId, canSwitch, go }: { storeSlugOrId: string; canSwitch: boolean; go: (p: string) => void }) {
  const [data, setData] = useState<KitchenResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [soundOn, setSoundOn] = useState(false)
  const [busyMode, setBusyMode] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const known = useRef<Set<string>>(new Set())

  const online = useOnline()

  const load = useCallback(async () => {
    try {
      setError(null)
      const res = await get<KitchenResponse>(`/api/kitchen/tickets?storeId=${encodeURIComponent(storeSlugOrId)}`)
      setData(res)
      // chime for genuinely new NEW-status tickets
      const fresh = res.tickets.filter((t) => t.status === 'NEW' && !known.current.has(t.ticketId))
      for (const t of res.tickets) known.current.add(t.ticketId)
      if (fresh.length > 0 && known.current.size > fresh.length && soundOn) playChime()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load tickets')
    } finally {
      setLoading(false)
    }
  }, [storeSlugOrId, soundOn])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  usePolling(load, 5000)
  useRealtime(data ? [`store:${data.store.id}`] : [], (event, payload) => {
    if (event === 'ticket:new') {
      const info = payload as { storeName?: string }
      if (soundOn) playChime()
      toast.info(`New paid ticket${info?.storeName ? ` · ${info.storeName}` : ''}`, { duration: 4000 })
    }
    void load()
  })

  const advance = async (ticket: KitchenTicket, to: string) => {
    setActing(ticket.ticketId)
    try {
      // identity comes from the session cookie — the client sends nothing else
      await post(`/api/kitchen/tickets/${ticket.ticketId}/status`, { to })
      toast.success(`${ticket.ticketCode} → ${to.replaceAll('_', ' ').toLowerCase()}`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Update failed')
    } finally {
      setActing(null)
      void load()
    }
  }
  const toggleStore = async () => {
    if (!data) return
    try {
      await patch(`/api/stores/${data.store.id}`, { isOpen: !data.store.isOpen })
      toast.success(data.store.isOpen ? 'Store closed — menu shows as unavailable' : 'Store open')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed')
    } finally {
      void load()
    }
  }
  const enableSound = () => {
    armAudio()
    playChime(1)
    setSoundOn(true)
    toast.success('Sound on — you will hear a chime for every new paid ticket')
  }

  if (loading && !data) return <Spinner label="Loading kitchen tickets…" />
  if (error)
    return (
      <div className="mx-auto max-w-md px-4 pt-16">
        <LoadError message={error} onRetry={load} />
      </div>
    )
  if (!data) return null

  const active = data.tickets.filter((t) => ['NEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP'].includes(t.status))
  const done = data.tickets.filter((t) => ['PICKED_UP', 'DELIVERED'].includes(t.status)).slice(-6).reverse()

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16 pt-6">
      {canSwitch ? (
        <button onClick={() => go('#/kitchen')} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Switch kitchen
        </button>
      ) : (
        <button onClick={() => go('#/staff')} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Staff portal
        </button>
      )}

      <header className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-extrabold tracking-[0.18em] text-orange-600">KITCHEN DASHBOARD · LIVE</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-black tracking-tight">
              <span aria-hidden>{data.store.emoji}</span> {data.store.name}
            </h1>
          </div>
          <LiveDot connected={online} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!soundOn ? (
            <button onClick={enableSound} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-amber-500 to-orange-500 px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm shadow-orange-500/30 hover:from-amber-600 hover:to-orange-600">
              <Bell className="h-3.5 w-3.5" aria-hidden /> Enable sound
            </button>
          ) : (
            <button
              onClick={() => setSoundOn(false)}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700"
            >
              <Volume2 className="h-3.5 w-3.5" aria-hidden /> Sound on
            </button>
          )}
          <button
            onClick={() => setBusyMode((b) => !b)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold ${busyMode ? 'border-orange-400 bg-orange-100 text-orange-700' : 'border-stone-300 bg-white text-stone-500 hover:bg-stone-50'}`}
            aria-pressed={busyMode}
          >
            <Flame className="h-3.5 w-3.5" aria-hidden /> {busyMode ? 'Busy view +10m ON' : 'Busy view +10m'}
          </button>
          <span className="sr-only">Busy mode is a local display preference only — it does not change promised times for customers or the runner queue.</span>
          <button
            onClick={toggleStore}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold ${data.store.isOpen ? 'border-stone-300 bg-white text-stone-500 hover:bg-stone-50' : 'border-red-300 bg-red-50 text-red-700'}`}
          >
            <StoreIcon className="h-3.5 w-3.5" aria-hidden /> {data.store.isOpen ? 'Open (tap to close)' : 'Closed (tap to open)'}
          </button>
        </div>
      </header>

      {/* active tickets */}
      <section className="mt-4" aria-label="Active tickets">
        <h2 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Active tickets ({active.length})</h2>
        {active.length === 0 ? (
          <EmptyState
            icon={<BellOff className="h-6 w-6" aria-hidden />}
            title="No active tickets"
            hint="New paid orders appear here in realtime — place one from the customer console."
          />
        ) : (
          <ul className="space-y-3">
            {active.map((t) => {
              const action = NEXT_ACTION[t.status]
              const eta = t.prepEtaMinutes + (busyMode ? 10 : 0)
              const hasAllergy = t.items.some((i) => i.notes)
              return (
                <li
                  key={t.ticketId}
                  className={`rounded-2xl border bg-card p-4 ${t.status === 'NEW' ? 'border-amber-400 bg-amber-50/50 shadow-lg shadow-amber-500/10' : 'border-border'}`}
                  aria-live={t.status === 'NEW' ? 'polite' : undefined}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-black">
                        {t.ticketCode} · Seat {t.seat}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {t.screen} · {t.cinema} · {t.movieTitle ?? 'walk-in'} · placed {minAgo(t.placedAt)}
                      </p>
                    </div>
                    <StatusPill status={t.status} />
                  </div>

                  <ul className="mt-3 space-y-1.5 rounded-xl bg-background p-3">
                    {t.items.map((i) => (
                      <li key={i.name} className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="font-semibold">
                          <span className="mr-1.5 inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-black text-violet-700">{i.qty}×</span>
                          {i.name}
                          {i.notes && <span className="mt-0.5 block rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">⚠ {i.notes}</span>}
                        </span>
                        <span className="text-[11px] tabular text-muted-foreground">{rupees(i.lineTotalPaise)}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className={`text-[11px] font-semibold ${hasAllergy ? 'text-amber-700' : 'text-muted-foreground'}`}>
                      Due ~{eta} min {t.runner ? `· runner: ${t.runner}` : ''}
                    </p>
                    {action && (
                      <button
                        onClick={() => advance(t, action.to)}
                        disabled={acting === t.ticketId}
                        className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-amber-500 to-orange-500 px-4 py-2 text-xs font-extrabold text-white shadow-sm shadow-orange-500/30 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
                      >
                        {acting === t.ticketId && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />}
                        {action.label}
                      </button>
                    )}
                    {!action && <span className="text-[11px] font-bold text-emerald-600">Waiting for runner</span>}
                  </div>

                  {t.status === 'NEW' && (
                    <p className="mt-2 rounded-lg bg-amber-100/70 px-3 py-2 text-[11px] font-bold text-amber-800" role="note">
                      Accept fast — the customer can still cancel until you accept. Accepting locks the order.
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* completed */}
      {done.length > 0 && (
        <section className="mt-6" aria-label="Recently completed">
          <h2 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Out for delivery / delivered</h2>
          <ul className="space-y-2">
            {done.map((t) => (
              <li key={t.ticketId} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-2.5">
                <p className="text-xs font-semibold">
                  {t.ticketCode} · Seat {t.seat} <span className="font-normal text-muted-foreground">· {timeHM(t.deliveredAt)}</span>
                </p>
                <StatusPill status={t.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
