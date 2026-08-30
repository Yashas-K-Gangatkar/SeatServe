'use client'

// SeatServe — mall admin board (#/admin)
// KPIs, live orders, refund requests, settlement summary, store & inventory controls, audit log.
import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, IndianRupee, Receipt, Timer, Truck, CircleSlash, Wallet, ScrollText, ChevronDown, ChevronUp, ScanSearch } from 'lucide-react'
import { toast } from 'sonner'
import { get, patch, post, ApiError } from '@/lib/client/api'
import { useRealtime, usePolling, useOnline } from '@/lib/client/realtime'
import type { AdminOverview } from '@/lib/client/types'
import StaffGate from '../StaffGate'
import SettlementPanel from './SettlementPanel'
import { rupees, timeHM, minAgo, StatusPill, LiveDot, Spinner, LoadError, EmptyState } from '../ui-bits'

const BENEFICIARY_LABEL: Record<string, string> = {
  STORE: 'Stores (net)',
  PLATFORM_COMMISSION: 'Platform (commission + fee)',
}

export default function Admin({ go }: { go: (p: string) => void }) {
  return (
    <StaffGate roles={['MALL_ADMIN', 'CINEMA_MANAGER']} go={go} consoleName="Admin board">
      {(user) => <AdminBoard go={go} scopeRole={user.role} />}
    </StaffGate>
  )
}

function AdminBoard({ go, scopeRole }: { go: (p: string) => void; scopeRole: 'MALL_ADMIN' | 'CINEMA_MANAGER' }) {
  const [data, setData] = useState<AdminOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedStore, setExpandedStore] = useState<string | null>(null)
  const online = useOnline()

  const load = useCallback(async () => {
    try {
      setError(null)
      setData(await get<AdminOverview>('/api/admin/overview'))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load admin data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  usePolling(load, 6000)
  // mall-scoped admin room (token-gated) — known once the overview has loaded
  useRealtime(data?.scope?.realtimeMallId ? [`admin:${data.scope.realtimeMallId}`] : [], () => void load())

  const toggleStore = async (id: string, isOpen: boolean, name: string) => {
    try {
      await patch(`/api/stores/${id}`, { isOpen })
      toast.success(`${name} ${isOpen ? 'opened' : 'closed'}`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed')
    } finally {
      void load()
    }
  }

  // Phase 4 — KYC review: verified stores unlock settlement payouts
  const reviewKyc = async (storeId: string, name: string, action: 'VERIFY' | 'REJECT') => {
    try {
      const res = await post<{ kycStatus: string }>(`/api/admin/kyc/${storeId}`, { action })
      toast.success(`${name}: KYC ${res.kycStatus.toLowerCase()}`, {
        description: res.kycStatus === 'VERIFIED' ? 'Payouts unlocked for this store' : 'The store must resubmit their details',
      })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed')
    } finally {
      void load()
    }
  }

  const toggleProduct = async (id: string, isAvailable: boolean, name: string) => {
    try {
      await patch(`/api/products/${id}`, { isAvailable })
      toast.success(`${name} ${isAvailable ? 'back in stock' : 'marked sold out'}`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed')
    } finally {
      void load()
    }
  }

  // Audit fix #2 UI: the refund inbox used to be read-only ("lands in Phase 3")
  // while money dead-ended in REQUESTED. The finance desk can now act.
  const refundAction = async (refundId: string, action: 'APPROVE' | 'REJECT' | 'PROCESS', code: string) => {
    try {
      await post(`/api/admin/refunds/${refundId}/action`, { action })
      toast.success(`Refund ${action.toLowerCase()}d for ${code}`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Refund action failed')
    } finally {
      void load()
    }
  }

  if (loading && !data) return <Spinner label="Loading admin board…" />
  if (error)
    return (
      <div className="mx-auto max-w-3xl px-4 pt-16">
        <LoadError message={error} onRetry={load} />
      </div>
    )
  if (!data) return null

  const kpiCards = [
    { icon: IndianRupee, label: 'Sales (24h)', value: rupees(data.kpis.salesPaise) },
    { icon: Receipt, label: 'Paid orders', value: String(data.kpis.ordersCount) },
    { icon: Wallet, label: 'Avg order value', value: rupees(data.kpis.aovPaise) },
    { icon: Timer, label: 'Avg prep time', value: data.kpis.avgPrepMin !== null ? `${data.kpis.avgPrepMin} min` : '—' },
    { icon: Truck, label: 'Avg runner leg', value: data.kpis.avgDeliveryMin !== null ? `${data.kpis.avgDeliveryMin} min` : '—' },
    { icon: CircleSlash, label: 'Cancellations', value: String(data.kpis.cancellations) },
  ]

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <button onClick={() => go('#/staff')} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Staff portal
      </button>
      {data.scope && (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-bold text-orange-700" role="status">
          Scoped view · {data.scope.label}
        </p>
      )}

      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-extrabold tracking-[0.18em] text-amber-600">
            {data.scope.role === 'MALL_ADMIN'
              ? `MALL ADMIN · ${(data.scope.mallName ?? 'MALL').toUpperCase()}`
              : data.scope.role === 'CINEMA_MANAGER'
                ? `CINEMA MANAGER · ${(data.scope.mallName ?? 'MALL').toUpperCase()}`
                : `STORE MANAGER · ${(data.scope.mallName ?? 'MALL').toUpperCase()}`}
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Operations board</h1>
          <p className="text-xs text-muted-foreground">Rolling window: {data.window.label}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <LiveDot connected={online} />
          <button
            onClick={() => go('#/qr')}
            className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-[11px] font-bold text-stone-600 shadow-sm hover:bg-stone-50"
          >
            QR sheets
          </button>
        </div>
      </header>

      {/* KPIs */}
      <section className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Key metrics">
        {kpiCards.map((k) => (
          <div key={k.label} className="rounded-2xl border border-border bg-card p-4">
            <k.icon className="h-4 w-4 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-xl font-black tabular leading-none">{k.value}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </section>

      {/* refunds alert */}
      {data.kpis.refundsOpen > 0 && (
        <section className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4" role="status">
          <p className="text-sm font-bold text-amber-900">{data.kpis.refundsOpen} open refund/support request{data.kpis.refundsOpen === 1 ? '' : 's'}</p>
          <ul className="mt-2 space-y-2">
            {data.refunds
              .filter((r) => r.status === 'REQUESTED' || r.status === 'APPROVED')
              .map((r) => (
                <li key={r.id} className="text-xs text-amber-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <b>{r.code}</b> · {r.reason.replaceAll('_', ' ').toLowerCase()} · {rupees(r.amountPaise)} · {r.status}
                    </span>
                    {scopeRole === 'MALL_ADMIN' && (
                      <span className="flex gap-1.5">
                        {r.status === 'REQUESTED' && (
                          <button
                            onClick={() => refundAction(r.id, 'APPROVE', r.code)}
                            className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100"
                          >
                            Approve
                          </button>
                        )}
                        <button
                          onClick={() => refundAction(r.id, 'PROCESS', r.code)}
                          className="rounded-full bg-gradient-to-b from-amber-500 to-orange-500 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm hover:from-amber-600 hover:to-orange-600"
                        >
                          Process refund
                        </button>
                        <button
                          onClick={() => refundAction(r.id, 'REJECT', r.code)}
                          className="rounded-full border border-red-300 bg-white px-2.5 py-1 text-[10px] font-bold text-red-600 hover:bg-red-50"
                        >
                          Reject
                        </button>
                      </span>
                    )}
                  </div>
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* live orders */}
      <section className="mt-6" aria-label="Live orders">
        <h2 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Live orders ({data.liveOrders.length})</h2>
        {data.liveOrders.length === 0 ? (
          <EmptyState title="No live orders" hint="Paid orders show up here the moment payment is captured." />
        ) : (
          <ul className="space-y-2">
            {data.liveOrders.map((o) => (
              <li key={o.code} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-black">
                      {o.code} · <span className="text-orange-600">Seat {o.seat}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {o.screen} · {o.cinema} · {minAgo(o.placedAt)} · {rupees(o.totalPaise)}
                    </p>
                  </div>
                  <StatusPill status={o.status === 'COMPLETED' ? 'DELIVERED' : 'ACCEPTED'} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {o.tickets.map((t) => (
                    <StatusPill key={t.ticketId} status={t.status} className="!px-2 !text-[10px]" />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* stores */}
      <section className="mt-6" aria-label="Stores and inventory">
        <h2 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Stores & inventory</h2>
        <ul className="space-y-2">
          {data.stores.map((s) => (
            <li key={s.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold">
                    <span aria-hidden>{s.emoji}</span> {s.name}
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${s.kycStatus === 'VERIFIED' ? 'bg-emerald-100 text-emerald-700' : s.kycStatus === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                      KYC {s.kycStatus}
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    24h: {s.ordersLast24h} tickets · {rupees(s.salesPaise)} · live {s.liveTickets}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {scopeRole === 'MALL_ADMIN' && s.kycStatus !== 'VERIFIED' && (
                    <button
                      onClick={() => reviewKyc(s.id, s.name, 'VERIFY')}
                      className="rounded-full bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700"
                    >
                      Verify KYC
                    </button>
                  )}
                  {scopeRole === 'MALL_ADMIN' && s.kycStatus === 'PENDING' && (
                    <button
                      onClick={() => reviewKyc(s.id, s.name, 'REJECT')}
                      className="rounded-full border border-red-300 bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-100"
                    >
                      Reject
                    </button>
                  )}
                  <button
                    onClick={() => setExpandedStore(expandedStore === s.id ? null : s.id)}
                    className="rounded-full border border-border px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted"
                    aria-expanded={expandedStore === s.id}
                  >
                    {expandedStore === s.id ? <ChevronUp className="h-3 w-3" aria-hidden /> : <ChevronDown className="h-3 w-3" aria-hidden />} Items
                  </button>
                  <button
                    onClick={() => toggleStore(s.id, !s.isOpen, s.name)}
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-bold ${s.isOpen ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-red-300 bg-red-50 text-red-700'}`}
                  >
                    {s.isOpen ? 'Open' : 'Closed'}
                  </button>
                </div>
              </div>
              {expandedStore === s.id && (
                <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                  {s.products.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl bg-background px-3 py-2">
                      <span className="truncate text-xs font-semibold">{p.name}</span>
                      <button
                        onClick={() => toggleProduct(p.id, !p.isAvailable, p.name)}
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${p.isAvailable ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}
                      >
                        {p.isAvailable ? 'Available' : 'Sold out'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* settlement summary */}
      <section className="mt-6 rounded-2xl border border-border bg-card p-4" aria-label="Settlement summary">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Pending settlement ledger (Phase 3 pays these out)</h2>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          {data.settlement.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing pending — settle up!</p>
          ) : (
            data.settlement.map((s) => (
              <div key={s.beneficiary} className="flex items-center justify-between rounded-xl bg-background px-3 py-2 text-sm">
                <dt className="text-muted-foreground">{BENEFICIARY_LABEL[s.beneficiary] ?? s.beneficiary}</dt>
                <dd className="font-bold tabular">{rupees(s.pendingPaise)}</dd>
              </div>
            ))
          )}
        </dl>
      </section>

      {/* Phase 3: settlement runs + reconciliation (money actions are mall-admin only) */}
      {scopeRole === 'MALL_ADMIN' && <SettlementPanel canAct />}

      {/* anti-scam: trace which orders came from a seat QR */}
      <SeatTrace />

      {/* audit log */}
      <section className="mt-6" aria-label="Audit log">
        <h2 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
          <ScrollText className="h-3.5 w-3.5" aria-hidden /> Audit trail
        </h2>
        <ul className="kitchen-scroll max-h-72 space-y-1.5 overflow-y-auto rounded-2xl border border-border bg-card p-3">
          {data.audit.map((a) => (
            <li key={a.id} className="text-[11px] leading-relaxed text-muted-foreground">
              <span className="tabular text-muted-foreground/60">{timeHM(a.at)}</span>{' '}
              <span className="font-bold text-foreground">{a.action}</span>
              {a.actorRef ? <span className="text-orange-600"> · {a.actorRef}</span> : null}
              {a.orderCode ? <span> · {a.orderCode}</span> : null}
              {a.meta && (a.meta as { from?: string; to?: string }).to ? (
                <span>
                  {' '}
                  ({String((a.meta as { from: string }).from).replaceAll('_', ' ')} → {String((a.meta as { to: string }).to).replaceAll('_', ' ')})
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

// Anti-scam seat trace — every seat has a UNIQUE QR and every order permanently
// records the seat it was placed from. Staff type a QR token or seat code to see
// exactly which orders came from that seat (and who claimed it). Lookups are audited.
function SeatTrace() {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{
    seat: { code: string; qrToken: string; screen: string; cinema: string; mall: string }
    orders: { code: string; placedAt: string; customerName: string | null; status: string; paymentStatus: string; totalPaise: number; stores: { name: string; emoji: string | null; status: string }[] }[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const trace = async () => {
    if (query.trim().length < 2 || busy) return
    setBusy(true)
    setError(null)
    try {
      setResult(await get(`/api/admin/seat-trace?q=${encodeURIComponent(query.trim())}`))
    } catch (err) {
      setResult(null)
      setError(err instanceof ApiError ? err.message : 'Lookup failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-4" aria-label="Seat trace">
      <h2 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
        <ScanSearch className="h-3.5 w-3.5" aria-hidden /> Seat trace · which orders came from a seat QR
      </h2>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        Every seat's QR is unique and every order permanently records the seat it was placed from. Paste the QR token (or a seat code like F-12) to audit a suspicious order — lookups are logged to the audit trail.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void trace()
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="QR token or seat code (e.g. F-12)"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Seat QR token or seat code"
          className="flex-1 rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-sm font-bold uppercase tracking-wide outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-200"
        />
        <button
          type="submit"
          disabled={busy || query.trim().length < 2}
          className="rounded-xl bg-gradient-to-b from-amber-500 to-orange-500 px-4 py-2 text-sm font-extrabold text-white shadow-md shadow-orange-500/25 transition hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
        >
          {busy ? 'Checking…' : 'Trace'}
        </button>
      </form>

      {error && (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-3">
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 ring-1 ring-amber-200">
            Seat {result.seat.code} · {result.seat.screen} · {result.seat.cinema} · {result.seat.mall}
            <span className="ml-1 font-mono text-[10px] font-semibold text-amber-700/80">QR {result.seat.qrToken}</span>
          </p>
          {result.orders.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">No orders have ever been placed from this seat.</p>
          ) : (
            <ul className="kitchen-scroll mt-2 max-h-64 space-y-1.5 overflow-y-auto">
              {result.orders.map((o) => (
                <li key={o.code} className="rounded-xl bg-background px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black">{o.code}</span>
                    <span className="tabular font-bold text-orange-600">{rupees(o.totalPaise)}</span>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">
                    {timeHM(o.placedAt)} · {o.customerName ?? 'name not given'} · {o.status.replaceAll('_', ' ')} · {o.paymentStatus}
                  </p>
                  <p className="mt-0.5">{o.stores.map((s) => `${s.emoji ?? ''} ${s.name} (${s.status.replaceAll('_', ' ')})`).join(' · ')}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
