'use client'

<<<<<<< HEAD
// SeatServe — customer help (#/support/<code>)
// Policy: the cinema does not refund online. Money issues are resolved in
// person at the counter — this page gives the customer their order facts and
// exactly where to go, so staff can look the order up by its tracking number.
=======
// SeatServe — customer support desk (#/support/<code>)
>>>>>>> origin/main
import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, CircleHelp, MapPin, ReceiptText } from 'lucide-react'
import { get, ApiError } from '@/lib/client/api'
import { useRealtime } from '@/lib/client/realtime'
import type { TrackingResponse } from '@/lib/client/types'
import { rupees, Spinner, LoadError, StatusPill } from '../ui-bits'

export default function Support({ code, go }: { code: string; go: (p: string) => void }) {
  const [order, setOrder] = useState<TrackingResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setError(null)
      setOrder(await get<TrackingResponse>(`/api/orders/${encodeURIComponent(code)}`))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load order')
    } finally {
      setLoading(false)
    }
  }, [code])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  useRealtime([`order:${code.toUpperCase()}`], () => void load())

  if (loading && !order) return <Spinner label="Loading order…" />
  if (error)
    return (
      <div className="mx-auto max-w-md px-4 pt-16">
        <LoadError message={error} onRetry={load} />
      </div>
    )
  if (!order) return null

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16 pt-6">
      <button onClick={() => go(`#/track/${order.code}`)} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Back to tracking
      </button>

      <header>
        <p className="text-[10px] font-extrabold tracking-[0.18em] text-orange-600">SUPPORT DESK</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-black tracking-tight">
          <CircleHelp className="h-6 w-6 text-orange-500" aria-hidden /> Help & support
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Order {order.code} · {order.location.screen} · Seat {order.location.seat} · {rupees(order.totals.totalPaise)}
        </p>
      </header>

<<<<<<< HEAD
      <section className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4" role="status">
        <p className="text-sm font-bold text-amber-900">Talk to us in person</p>
        <p className="mt-1.5 text-xs leading-relaxed text-amber-800">
          For anything wrong with this order — a missing item, a cancelled store, a payment question — walk to the food-court
          counter (ground floor, next to {order.location.cinema}). Show them the tracking number below; staff can see the full
          order history instantly.
        </p>
        <p className="mt-3 select-all rounded-xl bg-white px-3 py-2 text-center text-lg font-black tracking-[0.14em] text-stone-900">
          {order.code}
        </p>
        <p className="mt-2 text-center text-[11px] text-amber-700">
          As per cinema policy, payments are not refunded online — the counter resolves everything on the spot.
        </p>
      </section>
=======
      {openRefund ? (
        <section className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4" role="status">
          <p className="text-sm font-bold text-amber-900">Request already open</p>
          <p className="mt-1 text-xs text-amber-700">
            {openRefund.reason.replaceAll('_', ' ').toLowerCase()} · {rupees(openRefund.amountPaise)} · status: {openRefund.status}. The theatre team is reviewing it and will reach out to you.
          </p>
          <button onClick={() => go(`#/track/${order.code}`)} className="mt-3 rounded-full border border-amber-400 bg-white px-4 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100">
            Back to tracking
          </button>
        </section>
      ) : (
        <section className="mt-6 rounded-2xl border border-border bg-card p-4">
          <label htmlFor="reason" className="text-xs font-bold text-muted-foreground">What went wrong?</label>
          <select
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
>>>>>>> origin/main

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" aria-hidden /> Where to go
        </h2>
        <ul className="mt-2 space-y-1.5 text-sm text-stone-700">
          <li>• Food-court counter — ground floor, beside the ticketed lobby</li>
          <li>• Or ask any runner wearing the SeatServe badge</li>
          <li>• In-screen help: flag the aisle host before the interval</li>
        </ul>
      </section>

<<<<<<< HEAD
      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
          <ReceiptText className="h-3.5 w-3.5" aria-hidden /> Order summary for staff
        </h2>
        <ul className="mt-2 divide-y divide-border/60">
          {order.stores.map((s) => (
            <li key={s.ticketId} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0">
                <span aria-hidden>{s.emoji}</span> {s.storeName}
                {s.items.map((i) => (
                  <span key={i.name} className="block text-xs text-muted-foreground">
                    {i.name} × {i.qty}
                  </span>
                ))}
              </span>
              <StatusPill status={s.status} />
            </li>
          ))}
        </ul>
      </section>
=======
          <button
            onClick={submit}
            disabled={submitting}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-b from-amber-500 to-orange-500 py-3 text-sm font-extrabold text-white shadow-md shadow-orange-500/30 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
          >
            <Send className="h-4 w-4" aria-hidden /> {submitting ? 'Sending…' : 'Send to support desk'}
          </button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Requests land on the mall admin board instantly and are audited.
          </p>
        </section>
      )}

      {order.refunds.length > 0 && (
        <section className="mt-4" aria-label="Past requests">
          <h2 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Past requests</h2>
          <ul className="space-y-2">
            {order.refunds.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
                <div className="text-xs">
                  <p className="font-bold">{r.reason.replaceAll('_', ' ')}</p>
                  <p className="text-muted-foreground">{new Date(r.createdAt).toLocaleString('en-IN')}</p>
                </div>
                <StatusPill status={r.status === 'PROCESSED' ? 'DELIVERED' : r.status === 'REJECTED' ? 'CANCELLED' : 'ACCEPTED'} />
              </li>
            ))}
          </ul>
        </section>
      )}
>>>>>>> origin/main
    </div>
  )
}
