'use client'

// SeatServe — live order tracking (#/track/<code>)
// Realtime via socket.io + 4s polling fallback. Per-store status timelines,
// runner leg, payment state (incl. retry), refund/help entry.
import { useCallback, useEffect, useState } from 'react'
import { Check, ChefHat, Bike, PackageCheck, CircleHelp, ChevronLeft, MapPin, CreditCard, ReceiptText } from 'lucide-react'
import { get, ApiError } from '@/lib/client/api'
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
            <p className="text-[10px] font-extrabold tracking-[0.18em] text-violet-300">ORDER {order.code}</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight">
              {awaitingPayment ? 'Waiting for payment' : order.status === 'COMPLETED' ? 'Enjoyed your snacks?' : 'Food is on its way'}
            </h1>
          </div>
          <span className="rounded-xl bg-background px-3 py-2 text-center">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Seat</span>
            <span className="text-lg font-black leading-none text-lime-300">{order.location.seat}</span>
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
        <section className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4" role="alert">
          <p className="text-sm font-bold text-red-200">Payment failed — order not sent to stores.</p>
          <button
            onClick={() => setRetryOpen(true)}
            className="mt-3 w-full rounded-full bg-lime-300 py-3 text-sm font-extrabold text-lime-950 hover:bg-lime-200"
          >
            Retry payment {rupees(order.totals.totalPaise)}
          </button>
        </section>
      )}      {order.payment && !awaitingPayment && (
        <section className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
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
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300">PAID</span>
        </section>
      )}
      {!order.payment && awaitingPayment && !paymentFailed && (
        <section className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-bold text-amber-200">Payment not completed yet.</p>
          <button onClick={() => setRetryOpen(true)} className="mt-3 w-full rounded-full bg-lime-300 py-3 text-sm font-extrabold text-lime-950 hover:bg-lime-200">
            Pay now {rupees(order.totals.totalPaise)}
          </button>
        </section>
      )}

      {/* per-store tickets */}
      <section className="mt-4 space-y-3" aria-label="Store statuses">
        {order.stores.map((store) => {
          const idx = stepIndex(store.status)
          const cancelled = store.status === 'CANCELLED'
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
                      {item.notes && <span className="block text-[11px] font-semibold text-amber-300">📝 {item.notes}</span>}
                    </span>
                    <span className="tabular text-muted-foreground">{rupees(item.lineTotalPaise)}</span>
                  </li>
                ))}
              </ul>

              {!cancelled && (
                <ol className="mt-4 flex items-center" aria-label="Delivery progress">
                  {STEPS.map((step, i) => {
                    const done = i <= idx
                    const isRunnerStep = step.key === 'PICKED_UP'
                    const Icon = step.key === 'DELIVERED' ? PackageCheck : isRunnerStep ? Bike : ChefHat
                    return (
                      <li key={step.key} className="flex flex-1 flex-col items-center last:flex-none" aria-current={i === idx ? 'step' : undefined}>
                        <div className="flex w-full items-center">
                          <span className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : done ? 'bg-lime-300/70' : 'bg-border'}`} aria-hidden />
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                              done ? 'border-lime-300/70 bg-lime-300/15 text-lime-300' : 'border-border text-muted-foreground/50'
                            }`}
                          >
                            {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Icon className="h-3 w-3" aria-hidden />}
                          </span>
                          <span className={`h-0.5 flex-1 ${i === STEPS.length - 1 ? 'opacity-0' : i < idx ? 'bg-lime-300/70' : 'bg-border'}`} aria-hidden />
                        </div>
                        <span className={`mt-1 hidden text-[9px] font-semibold sm:block ${done ? 'text-foreground' : 'text-muted-foreground/60'}`}>
                          {step.label}
                        </span>
                      </li>
                    )
                  })}
                </ol>
              )}

              {store.deliveryRun && (
                <p className="mt-3 rounded-xl bg-background px-3 py-2 text-xs text-muted-foreground">
                  <Bike className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                  {RUN_STATUS_LABEL[store.deliveryRun.status] ?? store.deliveryRun.status} · {store.deliveryRun.runner} · {store.deliveryRun.dropLabel}
                </p>
              )}
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
          <div className="flex justify-between border-t border-border pt-1.5 font-black"><dt>Total paid</dt><dd className="tabular text-lime-300">{rupees(order.totals.totalPaise)}</dd></div>
        </dl>
      </section>

      <button
        onClick={() => go(`#/support/${order.code}`)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3.5 text-sm font-bold text-foreground hover:bg-muted"
      >
        <CircleHelp className="h-4 w-4 text-violet-300" aria-hidden /> Help, refunds & support
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
