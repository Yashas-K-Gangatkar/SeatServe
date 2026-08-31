'use client'

// SeatServe — customer support desk (#/support/<code>)
import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, CircleHelp, Send } from 'lucide-react'
import { toast } from 'sonner'
import { get, post, ApiError } from '@/lib/client/api'
import { useRealtime } from '@/lib/client/realtime'
import type { TrackingResponse } from '@/lib/client/types'
import { rupees, Spinner, LoadError, StatusPill } from '../ui-bits'

const REASONS = [
  { value: 'WRONG_ITEM', label: 'Wrong or missing item' },
  { value: 'NEVER_DELIVERED', label: 'Order never arrived' },
  { value: 'PARTIAL_STORE_CANCEL', label: 'A store cancelled part of my order' },
  { value: 'OTHER', label: 'Something else' },
]

export default function Support({ code, go }: { code: string; go: (p: string) => void }) {
  const [order, setOrder] = useState<TrackingResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reason, setReason] = useState('WRONG_ITEM')
  const [detail, setDetail] = useState('')
  const [submitting, setSubmitting] = useState(false)

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

  const submit = async () => {
    setSubmitting(true)
    try {
      await post(`/api/orders/${encodeURIComponent(code)}/support`, {
        reason,
        detail: detail.trim() || undefined,
      })
      toast.success('Request sent to the mall support desk')
      setDetail('')
      void load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not submit request')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading && !order) return <Spinner label="Loading order…" />
  if (error)
    return (
      <div className="mx-auto max-w-md px-4 pt-16">
        <LoadError message={error} onRetry={load} />
      </div>
    )
  if (!order) return null

  const openRefund = order.refunds.find((r) => r.status === 'REQUESTED' || r.status === 'APPROVED')

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

          <label htmlFor="detail" className="mt-4 block text-xs font-bold text-muted-foreground">Details (optional)</label>
          <textarea
            id="detail"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Tell us what happened — e.g. popcorn arrived but cold coffee missing"
            className="mt-1.5 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />

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
    </div>
  )
}
