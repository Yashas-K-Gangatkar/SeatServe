'use client'

// SeatServe — runner console (#/runner[/<runnerId>])
// Ready pickups → claim → Pick up → Deliver. Zones & drop labels shown per run.
import { useCallback, useEffect, useState } from 'react'
import { Bike, ChevronLeft, Clock, MapPin, PackageCheck, ShoppingBag, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { get, post, ApiError } from '@/lib/client/api'
import { useRealtime, usePolling, useOnline } from '@/lib/client/realtime'
import type { RunnerResponse } from '@/lib/client/types'
import StaffGate from '../StaffGate'
import { timeHM, minAgo, StatusPill, LiveDot, Spinner, LoadError, EmptyState } from '../ui-bits'
import { slotLabel } from '@/lib/scheduling'

export default function Runner({ runnerId, go, onRouteChange }: { runnerId?: string; go: (p: string) => void; onRouteChange?: () => void }) {
  return (
    <StaffGate roles={['RUNNER', 'MALL_ADMIN']} go={go} consoleName="Runner console">
      {(user) => <RunnerConsole role={user.role} runnerId={runnerId} go={go} onRouteChange={onRouteChange} />}
    </StaffGate>
  )
}

function RunnerConsole({ role, runnerId, go, onRouteChange }: { role: string; runnerId?: string; go: (p: string) => void; onRouteChange?: () => void }) {
  const [data, setData] = useState<RunnerResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const online = useOnline()

  const load = useCallback(async () => {
    try {
      setError(null)
      setData(await get<RunnerResponse>(`/api/runner${runnerId ? `?runnerId=${encodeURIComponent(runnerId)}` : ''}`))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load runner console')
    } finally {
      setLoading(false)
    }
  }, [runnerId])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  usePolling(load, 5000)
  // mall-scoped runner room (token-gated) — known once the console has loaded
  useRealtime(data?.mallId ? [`runners:${data.mallId}`] : [], () => void load())

  const claim = async (ticketId: string) => {
    setActing(ticketId)
    try {
      await post('/api/runner/assign', { ticketId, runnerId: runnerId ?? undefined })
      toast.success('Run assigned to you')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not claim run')
    } finally {
      setActing(null)
      void load()
    }
  }

  const move = async (ticketId: string, to: 'PICKED_UP' | 'DELIVERED') => {
    setActing(ticketId)
    try {
      // identity comes from the session cookie — the client sends nothing else
      await post(`/api/runner/tickets/${ticketId}/status`, { to })
      toast.success(to === 'PICKED_UP' ? 'Picked up — deliver to seat' : 'Delivered — nice work')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Update failed')
    } finally {
      setActing(null)
      void load()
    }
  }

  const selectRunner = (id: string) => {
    go(`#/runner/${id}`)
    onRouteChange?.()
  }

  if (loading && !data) return <Spinner label="Loading runner console…" />
  if (error)
    return (
      <div className="mx-auto max-w-md px-4 pt-16">
        <LoadError message={error} onRetry={load} />
      </div>
    )
  if (!data) return null

  const me = data.runners.find((r) => r.id === data.activeRunnerId)

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16 pt-6">
      <button onClick={() => go('#/')} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Demo home
      </button>

      <header className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-extrabold tracking-[0.18em] text-emerald-600">RUNNER CONSOLE · LIVE</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-black tracking-tight">
              <Bike className="h-6 w-6 text-emerald-600" aria-hidden /> Runner
            </h1>
          </div>
          <LiveDot connected={online} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {/* Audit fix #34: RUNNER could tap another runner's chip and the URL
              changed, but the server pins data to the session runner — the UI
              showed a wrong "active" runner. Only the mall admin (front-desk
              coordination) sees the switcher; runners are always themselves. */}
          {role === 'MALL_ADMIN' &&
            data.runners.map((r) => (
              <button
                key={r.id}
                onClick={() => selectRunner(r.id)}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${data.activeRunnerId === r.id ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-stone-300 bg-white text-stone-500 hover:bg-stone-50'}`}
                aria-pressed={data.activeRunnerId === r.id}
              >
                {r.name} ★{r.rating.toFixed(1)}
              </button>
            ))}
          {role === 'RUNNER' && me && (
            <span className="rounded-full border border-emerald-400 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700">
              {me.name} ★{me.rating.toFixed(1)}
            </span>
          )}
          <span className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-[11px] text-stone-500">On duty today</span>
        </div>
      </header>

      {/* ready queue */}
      <section className="mt-4" aria-label="Ready pickups">
        <h2 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Ready for pickup ({data.queue.length})</h2>
        {data.queue.length === 0 ? (
          <EmptyState icon={<ShoppingBag className="h-6 w-6" aria-hidden />} title="Nothing ready right now" hint="Tickets appear the moment a kitchen marks an order ready." />
        ) : (
          <ul className="space-y-3">
            {data.queue.map((t) => {
              const mine = data.activeRunnerId && (t.assignedToId === data.activeRunnerId || !t.assignedTo)
              return (
                <li key={t.ticketId} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="flex flex-wrap items-center gap-1.5 text-sm font-black">
                        <span aria-hidden>{t.emoji}</span> {t.storeName} → Seat {t.seat}
                        {t.scheduledFor && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-black text-sky-700">
                            <Clock className="h-3 w-3" aria-hidden /> SLOT {slotLabel(t.scheduledFor)}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {t.orderCode} · {t.screen} · {t.cinema} · ready {minAgo(t.readyAt ?? '')}
                      </p>
                    </div>
                    <StatusPill status="READY_FOR_PICKUP" />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">{t.assignedTo ? `Runner: ${t.assignedTo}` : 'Unclaimed'}</p>
                    {mine ? (
                      <button
                        onClick={() => move(t.ticketId, 'PICKED_UP')}
                        disabled={acting === t.ticketId}
                        className="rounded-full bg-gradient-to-b from-amber-500 to-orange-500 px-4 py-2 text-xs font-extrabold text-white shadow-sm shadow-orange-500/30 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
                      >
                        <Zap className="mr-1 inline h-3 w-3" aria-hidden /> Pick up
                      </button>
                    ) : (
                      <span className="text-[11px] font-semibold text-muted-foreground">Assigned to {t.assignedTo}</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* my runs */}
      {data.activeRunnerId && (
        <section className="mt-6" aria-label="My delivery runs">
          <h2 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            {me?.name ?? 'My'} runs ({data.myRuns.length})
          </h2>
          {data.myRuns.length === 0 ? (
            <EmptyState title="No active runs" hint="Claim a ready order from the queue above." />
          ) : (
            <ul className="space-y-3">
              {data.myRuns.map((run) => (
                <li key={run.runId} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-black">
                      <span aria-hidden>{run.emoji}</span> {run.storeName} → Seat {run.seat}
                    </p>
                    <StatusPill status={run.status === 'PICKED_UP' ? 'PICKED_UP' : 'READY_FOR_PICKUP'} />
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <p className="flex items-start gap-1.5">
                      <ShoppingBag className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Pick up: {run.pickupLabel}
                    </p>
                    <p className="flex items-start gap-1.5">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" aria-hidden />
                      <span>
                        Deliver: {run.dropLabel} {run.movieTitle ? `· ${run.movieTitle}` : ''}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={() => move(run.ticketId, 'DELIVERED')}
                    disabled={acting === run.ticketId || run.status !== 'PICKED_UP'}
                    className="mt-3 w-full rounded-full bg-gradient-to-b from-amber-500 to-orange-500 py-2.5 text-xs font-extrabold text-white shadow-sm shadow-orange-500/30 hover:from-amber-600 hover:to-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <PackageCheck className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
                    {run.status === 'PICKED_UP' ? 'Mark delivered' : 'Pick up first'}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {data.recent.length > 0 && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Recent: {data.recent.map((r) => `${r.storeName} → ${r.seat} (${timeHM(r.deliveredAt)})`).join(' · ')}
            </p>
          )}
        </section>
      )}
    </div>
  )
}
