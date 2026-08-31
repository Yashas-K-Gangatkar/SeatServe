'use client'

// SeatServe — live order tracking (#/track/<code>)
// Realtime via socket.io + 4s polling fallback. Per-store status timelines,
// runner leg, payment state (incl. retry), support entry. Cinema-standard:
// orders are final once placed — no refunds (see /legal/refund).
import { useCallback, useEffect, useState } from 'react'
import { Check, ChefHat, Bike, PackageCheck, CircleHelp, ChevronLeft, MapPin, CreditCard, Copy, History } from 'lucide-react'
import { toast } from 'sonner'
import { get, post, ApiError } from '@/lib/client/api'
import { useRealtime, usePolling } from '@/lib/client/realtime'
import { recentOrders, type RememberedOrder } from '@/lib/client/orderMemory'
import type { TrackingResponse } from '@/lib/client/types'
import { rupees, timeHM, StatusPill, RUN_STATUS_LABEL, Spinner, LoadError, EmptyState } from '../ui-bits'
import { PaymentSheet } from './CheckoutSheet'
import { ReceiptSlot, ReceiptCurl } from './PaperReceipt'

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
  const [recents, setRecents] = useState<RememberedOrder[]>([])

  useEffect(() => {
    let alive = true
    // microtask: localStorage read after mount (avoids sync setState in effect)
    Promise.resolve().then(() => {
      if (alive) setRecents(recentOrders(3))
    })
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16 pt-10">
      <button onClick={() => go('#/')} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Demo home
      </button>
      <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-xl shadow-orange-500/5">
        <h1 className="text-xl font-black tracking-tight">Track your order</h1>
        <p className="mt-1 text-sm text-stone-600">Enter the tracking number from your payment confirmation (e.g. SS-7HYVEV).</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const cleaned = entry.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
            if (cleaned) go(`#/track/${cleaned.startsWith('SS-') ? cleaned : `SS-${cleaned}`}`)
          }}
          className="mt-4 flex gap-2"
        >
          <input
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            placeholder="SS-XXXXXX"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Order tracking number"
            className="flex-1 rounded-xl border border-stone-300 bg-stone-50 px-3.5 py-2.5 text-sm font-bold uppercase tracking-wide outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-200"
          />
          <button
            type="submit"
            className="rounded-xl bg-gradient-to-b from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-orange-500/25 transition hover:from-amber-600 hover:to-orange-600"
          >
            Track
          </button>
        </form>
        <p className="mt-3 text-[11px] leading-relaxed text-stone-500">
          The tracking number is shown right after payment — you can copy it there. Anyone who has it can follow the order, like a parcel tracking number; no account needed.
        </p>

        {recents.length > 0 && (
          <div className="mt-4 border-t border-dashed border-stone-200 pt-4">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-500">
              <History className="h-3.5 w-3.5" aria-hidden /> Recent on this device
            </p>
            <div className="mt-2 space-y-1.5">
              {recents.map((o) => (
                <button
                  key={o.code}
                  onClick={() => go(`#/track/${o.code}`)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-left text-xs font-bold text-stone-700 hover:border-amber-300 hover:bg-amber-50"
                >
                  <span className="tracking-wide">{o.code}</span>
                  <span className="truncate text-stone-400">{o.screenName} · {o.seatCode}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-stone-400">
              Orders this device placed in the last 24 hours — no need to retype the number.
            </p>
          </div>
        )}
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
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(order.code)
                  toast.success('Tracking number copied')
                } catch {
                  toast.error('Copy failed — long-press the code instead')
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-extrabold tracking-[0.14em] text-orange-600 ring-1 ring-amber-200 transition hover:bg-amber-100"
              aria-label={`Copy tracking number ${order.code}`}
            >
              ORDER {order.code} <Copy className="h-3 w-3" aria-hidden />
            </button>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight">
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
                <p
                  role="status"
                  className={`mt-3 rounded-xl border px-3 py-2 text-xs font-bold ${
                    store.cancelledByRole === 'CUSTOMER'
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {store.cancelledByRole === 'CUSTOMER'
                    ? 'You cancelled this store — your other stores are unaffected.'
                    : 'Cancelled by the store — this item will not be prepared. Our support desk will assist you.'}
                </p>
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

      {/* bill — printed like the payment receipt: slot + thermal paper + curl */}
      <div className="mt-4">
        <ReceiptSlot />
        <div className="relative z-10 -mt-1 overflow-hidden pb-4">
          <section
            aria-label="Bill"
            className="receipt-anim receipt-paper receipt-zigzag relative mx-auto w-full max-w-[300px] rounded-b-sm px-5 pb-7 pt-5 font-mono text-[12px] leading-relaxed text-stone-800"
          >
            <ReceiptCurl />

            <h2 className="text-center text-[13px] font-black tracking-[0.28em] text-stone-900">BILL</h2>
            <p className="mt-0.5 text-center text-[9px] font-semibold tracking-[0.16em] text-stone-500">
              {order.location.seat ? `SEAT ${order.location.seat} · ` : ''}{order.code}
            </p>

            <div className="my-3 border-t border-dashed border-stone-300" />

            {/* per-store lines — cancelled legs stay printed, marked cancelled */}
            {order.stores.map((s) => (
              <div key={s.ticketId} className={`mb-2 ${s.status === 'CANCELLED' ? 'opacity-60' : ''}`}>
                <p className="text-[11px] font-black tracking-wide text-stone-700">
                  {s.emoji ? `${s.emoji} ` : ''}
                  {s.storeName.toUpperCase()}
                  {s.status === 'CANCELLED' && <span className="ml-1 font-bold text-red-600">✕ CANCELLED</span>}
                </p>
                <ul className="mt-0.5 space-y-0.5">
                  {s.items.map((i) => (
                    <li
                      key={i.name}
                      className={`flex items-baseline justify-between gap-3 ${s.status === 'CANCELLED' ? 'line-through decoration-stone-400' : ''}`}
                    >
                      <span className="truncate">
                        {i.name} <span className="text-stone-500">× {i.qty}</span>
                      </span>
                      <span className="shrink-0 tabular">{rupees(i.lineTotalPaise)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="my-3 border-t border-dashed border-stone-300" />

            <dl className="space-y-0.5">
              <div className="flex justify-between">
                <dt className="text-stone-600">Item total</dt>
                <dd className="tabular">{rupees(order.totals.subtotalPaise)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-600">Platform fee 5%</dt>
                <dd className="tabular">{rupees(order.totals.platformFeePaise)}</dd>
              </div>
              <div className="mt-1 flex items-baseline justify-between border-t border-dashed border-stone-300 pt-1.5">
                <dt className="text-[13px] font-black tracking-wide text-stone-900">TOTAL PAID</dt>
                <dd className="text-[15px] font-black tabular text-stone-900">{rupees(order.totals.totalPaise)}</dd>
              </div>
            </dl>

            <div className="receipt-barcode mx-auto mt-4 h-7 w-2/3 opacity-80" aria-hidden />
            <p className="mt-2 text-center text-[8.5px] tracking-[0.14em] text-stone-500">GST INCLUDED AT STORE · NO DELIVERY FEE</p>
          </section>
        </div>
      </div>

      <button
        onClick={() => go(`#/support/${order.code}`)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3.5 text-sm font-bold text-foreground hover:bg-muted"
      >
        <CircleHelp className="h-4 w-4 text-orange-500" aria-hidden /> Help & support
      </button>

      {order.refunds.length > 0 && (
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Open support request: <b className="text-foreground">{order.refunds[0].reason}</b> · {order.refunds[0].status}
        </p>
      )}
      {retryOpen && (
        <PaymentSheet
          order={{ code: order.code, totalPaise: order.totals.totalPaise }}
          receipt={{
            seatCode: order.location.seat,
            screenName: order.location.screen,
            cinemaName: order.location.cinema,
            movie: order.show?.movieTitle,
            groups: order.stores
              .filter((s) => s.status !== 'CANCELLED')
              .map((s) => ({
                storeName: s.storeName,
                emoji: s.emoji,
                items: s.items.map((i) => ({ name: i.name, qty: i.qty, lineTotalPaise: i.lineTotalPaise })),
              })),
            subtotalPaise: order.totals.subtotalPaise,
            platformFeePaise: order.totals.platformFeePaise,
            totalPaise: order.totals.totalPaise,
          }}
          onClose={() => {
            setRetryOpen(false)
            void load()
          }}
        />
      )}    </div>
  )
}

