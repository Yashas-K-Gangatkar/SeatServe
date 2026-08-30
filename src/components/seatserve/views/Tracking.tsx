'use client'

// SeatServe — live order tracking (#/track/<code>)
// Realtime via socket.io + 4s polling fallback. Per-store status timelines,
// runner leg, payment state (incl. retry), refund/help entry.
import { useCallback, useEffect, useState } from 'react'
import { Check, ChefHat, Bike, PackageCheck, CircleHelp, ChevronLeft, MapPin, CreditCard, ReceiptText, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { get, post, ApiError } from '@/lib/client/api'
import { useRealtime, usePolling } from '@/lib/client/realtime'
import type { TrackingResponse } from '@/lib/client/types'
import { rupees, timeHM, StatusPill, RUN_STATUS_LABEL, Spinner, LoadError, EmptyState } from '../ui-bits'
import { PaymentSheet } from './CheckoutSheet'

const STEPS = [
  { key: 'NEW', label: 'Order sent' },
  { key: 'ACCEPTED', label: 'Accepted' },
  { key: 'PREPARING', label: 'Preparing' },
  { key: 'READY_FOR_PICKUP', label: 'Ready' },
  { key: 'PICKED_UP', label: 'On the way' },
  { key: 'DELIVERED', label: 'Delivered' },
]

function stepIndex(status: string): number {
  const i = STEPS.findIndex((s) => s.key === status)
  return i === -1 ? (status === 'CANCELLED' ? 0 : 0) : i
}

export default function Tracking({ code, go }: { code: string; go: (p: string) => void }) {
  // no code in URL → let the customer type/paste their order code
  if (!code) return <TrackEntry go={go} />
  return <TrackingInner code={code} go={go} />
}

function TrackEntry({ go }: { go: (p: string) => void }) {
  const [entry, setEntry] = useState('')
  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16 pt-10">
      <button onClick={() => go('#/')} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Demo home
      </button>
      <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-xl shadow-orange-500/5">
        <h1 className="text-xl font-black tracking-tight">Track your order</h1>
        <p className="mt-1 text-sm text-stone-600">Enter the order code from your payment confirmation (e.g. SS-7HYVEV).</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (entry.trim()) go(`#/track/${entry.trim().toUpperCase()}`)
          }}
          className="mt-4 flex gap-2"
        >
          <input
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            placeholder="SS-XXXXXX"
            aria-label="Order code"
            className="flex-1 rounded-xl border border-stone-300 bg-stone-50 px-3.5 py-2.5 text-sm font-bold uppercase tracking-wide outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-200"
          />
          <button
            type="submit"
            className="rounded-xl bg-gradient-to-b from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-orange-500/25 transition hover:from-amber-600 hover:to-orange-600"
          >
            Track
          </button>
        </form>
      </div>
    </div>
  )
}

function TrackingInner({ code, go }: { code: string; go: (p: string) => void }) {
  const [order, setOrder] = useState<TrackingResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [retryOpen, setRetryOpen] = useState(false)

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

  usePolling(load, 4000, !!order && order.paymentStatus !== 'PAID')
  usePolling(load, 8000, !!order && order.paymentStatus === 'PAID' && order.status !== 'COMPLETED')
  useRealtime([`order:${code.toUpperCase()}`], () => void load())

  if (loading && !order) return <Spinner label="Loading your order…" />
  if (error)
    return (
      <div className="mx-auto max-w-md px-4 pt-16">
        <LoadError message={error} onRetry={load} />
      </div>
    )
  if (!order) return null

  const paymentFailed = order.paymentStatus === 'FAILED'
  const awaitingPayment = order.status === 'PENDING_PAYMENT' || paymentFailed

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16 pt-6">
      <button onClick={() => go('#/')} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Demo home
      </button>

      <header className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold tracking-[0.18em] text-orange-600">ORDER {order.code}</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight">
              {awaitingPayment ? 'Waiting for payment' : order.status === 'COMPLETED' ? 'Enjoyed your snacks?' : 'Food is on its way'}
            </h1>
          </div>
          <span className="rounded-xl bg-amber-50 px-3 py-2 text-center ring-1 ring-amber-200">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-700">Seat</span>
            <span className="text-lg font-black leading-none text-orange-600">{order.location.seat}</span>
          </span>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {order.location.screen} · {order.location.seat} · {order.location.cinema}
        </p>
        {order.show && <p className="mt-1 text-xs text-muted-foreground">{order.show.movieTitle} · starts {timeHM(order.show.startsAt)}</p>}
      </header>

      {/* payment state */}
      {paymentFailed && (
        <section className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4" role="alert">
          <p className="text-sm font-bold text-red-800">Payment failed — order not sent to stores.</p>
          <button
            onClick={() => setRetryOpen(true)}
            className="mt-3 w-full rounded-full bg-gradient-to-b from-amber-500 to-orange-500 py-3 text-sm font-extrabold text-white shadow-md shadow-orange-500/30 hover:from-amber-600 hover:to-orange-600"
          >
            Retry payment {rupees(order.totals.totalPaise)}
          </button>
        </section>
      )}      {order.payment && !awaitingPayment && (
        <section className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CreditCard className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-bold">
                {order.payment.method} · {rupees(order.payment.amountPaise)} paid
              </p>
              <p className="text-[11px] text-muted-foreground">
                {order.payment.methodDetail ?? 'Paid'} · ref {order.payment.providerRef.slice(-8)}
              </p>
            </div>
          </div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">PAID</span>
        </section>
      )}
      {!order.payment && awaitingPayment && !paymentFailed && (
        <section className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-800">Payment not completed yet.</p>
          <button onClick={() => setRetryOpen(true)} className="mt-3 w-full rounded-full bg-gradient-to-b from-amber-500 to-orange-500 py-3 text-sm font-extrabold text-white shadow-md shadow-orange-500/30 hover:from-amber-600 hover:to-orange-600">
            Pay now {rupees(order.totals.totalPaise)}
          </button>
        </section>
      )}

      {/* per-store tickets */}
      <section className="mt-4 space-y-3" aria-label="Store statuses">
        {order.stores.map((store) => {
          const idx = stepIndex(store.status)
          const cancelled = store.status === 'CANCELLED'
          // Phase 3 partial cancel: possible while the kitchen hasn't started
          const canCancelLeg = !cancelled && order.payment && !awaitingPayment && (store.status === 'NEW' || store.status === 'ACCEPTED') && !store.deliveryRun
          return (
            <article key={store.ticketId} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-extrabold">
                  <span aria-hidden>{store.emoji}</span> {store.storeName}
                </h2>
                <StatusPill status={store.status} />
              </div>

              <ul className="mt-3 space-y-1">
                {store.items.map((item) => (
                  <li key={item.name} className="flex items-baseline justify-between gap-2 text-sm">
                    <span>
                      {item.name} <span className="text-muted-foreground">× {item.qty}</span>
                      {item.notes && <span className="block text-[11px] font-semibold text-amber-700">📝 {item.notes}</span>}
                    </span>
                    <span className="tabular text-muted-foreground">{rupees(item.lineTotalPaise)}</span>
                  </li>
                ))}
              </ul>

              {!cancelled ? (
                <ol className="mt-4 flex items-center" aria-label="Delivery progress">
                  {STEPS.map((step, i) => {
                    const done = i <= idx
                    const isRunnerStep = step.key === 'PICKED_UP'
                    const Icon = step.key === 'DELIVERED' ? PackageCheck : isRunnerStep ? Bike : ChefHat
                    return (
                      <li key={step.key} className="flex flex-1 flex-col items-center last:flex-none" aria-current={i === idx ? 'step' : undefined}>
                        <div className="flex w-full items-center">
                          <span className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : done ? 'bg-amber-500/80' : 'bg-border'}`} aria-hidden />
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                              done ? 'border-amber-500 bg-amber-500 text-white shadow-sm shadow-amber-500/40' : 'border-border bg-white text-stone-400'
                            }`}
                          >
                            {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Icon className="h-3 w-3" aria-hidden />}
                          </span>
                          <span className={`h-0.5 flex-1 ${i === STEPS.length - 1 ? 'opacity-0' : i < idx ? 'bg-amber-500/80' : 'bg-border'}`} aria-hidden />
                        </div>
                        <span className={`mt-1 hidden text-[9px] font-semibold sm:block ${done ? 'text-foreground' : 'text-muted-foreground/60'}`}>
                          {step.label}
                        </span>
                      </li>
                    )
                  })}
                </ol>
              ) : (
                <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700" role="status">
                  Cancelled by the store — this leg will not be prepared. A refund for this part is handled by the finance desk.
                </p>
              )}

              {store.deliveryRun && (
                <p className="mt-3 rounded-xl bg-background px-3 py-2 text-xs text-muted-foreground">
                  <Bike className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                  {RUN_STATUS_LABEL[store.deliveryRun.status] ?? store.deliveryRun.status} · {store.deliveryRun.runner} · {store.deliveryRun.dropLabel}
                </p>
              )}

              {canCancelLeg && <CancelLegButton orderCode={order.code} ticketId={store.ticketId} storeName={store.storeName} onChanged={load} />}
            </article>
          )
        })}
      </section>

      {/* bill + help */}
      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
          <ReceiptText className="h-3.5 w-3.5" aria-hidden /> Bill
        </h2>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Item total</dt><dd className="tabular">{rupees(order.totals.subtotalPaise)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">GST included</dt><dd className="tabular">{rupees(order.totals.taxPaise)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Delivery fee</dt><dd className="tabular">{rupees(order.totals.deliveryFeePaise)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Platform fee</dt><dd className="tabular">{rupees(order.totals.platformFeePaise)}</dd></div>
          <div className="flex justify-between border-t border-border pt-1.5 font-black"><dt>Total paid</dt><dd className="tabular text-orange-600">{rupees(order.totals.totalPaise)}</dd></div>
        </dl>
      </section>

      <button
        onClick={() => go(`#/support/${order.code}`)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3.5 text-sm font-bold text-foreground hover:bg-muted"
      >
        <CircleHelp className="h-4 w-4 text-orange-500" aria-hidden /> Help, refunds & support
      </button>

      {order.refunds.length > 0 && (
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Open support request: <b className="text-foreground">{order.refunds[0].reason}</b> · {order.refunds[0].status}
        </p>
      )}

      {retryOpen && (
        <PaymentSheet
          order={{ code: order.code, totalPaise: order.totals.totalPaise }}
          onClose={() => {
            setRetryOpen(false)
            void load()
          }}
        />
      )}    </div>
  )
}

// Phase 3 partial cancel — customer-initiated, two-tap confirm (money action).
function CancelLegButton({ orderCode, ticketId, storeName, onChanged }: { orderCode: string; ticketId: string; storeName: string; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const cancel = async () => {
    setBusy(true)
    try {
      const res = await post<{ refundTotalPaise: number; remainingStores: string[] }>(`/api/orders/${orderCode}/cancel-leg`, { ticketId })
      toast.success(
        res.refundTotalPaise > 0
          ? `${storeName} cancelled — ${rupees(res.refundTotalPaise)} refund on its way`
          : `${storeName} cancelled`,
      )
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not cancel')
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white py-2 text-[11px] font-bold text-stone-500 hover:bg-stone-50"
      >
        <XCircle className="h-3.5 w-3.5" aria-hidden /> Cancel {storeName} (auto refund)
      </button>
    )
  }
  return (
    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3" role="alertdialog" aria-label={`Confirm cancelling ${storeName}`}>
      <p className="text-xs font-bold text-red-800">
        Cancel {storeName}? You'll be refunded that store's food + its delivery fee share. Your other stores are unaffected.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={cancel}
          disabled={busy}
          className="flex-1 rounded-full bg-red-600 py-2 text-[11px] font-extrabold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? 'Cancelling…' : 'Yes, cancel it'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="flex-1 rounded-full border border-stone-300 bg-white py-2 text-[11px] font-bold text-stone-600 hover:bg-stone-50"
        >
          Keep it
        </button>
      </div>
    </div>
  )
}
