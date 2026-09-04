'use client'

// SeatServe — live order tracking (#/track/<code>)
// Realtime via socket.io + 4s polling fallback. Per-store status timelines,
// runner leg, payment state (incl. retry), help entry.
// CANCEL WINDOW (owner rule): a paid order can be cancelled by the customer
// ONLY while every store leg is still NEW — the moment a store taps Accept,
// the button disappears and the API refuses. Money returns to source
// automatically inside that window; after acceptance the store owns the
// order and resolves issues at the counter.
import { useCallback, useEffect, useState } from 'react'
import { Check, ChefHat, Bike, PackageCheck, CircleHelp, ChevronLeft, MapPin, CreditCard, ReceiptText, Copy, Lock, Undo2, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { get, post, ApiError } from '@/lib/client/api'
import { useRealtime, usePolling } from '@/lib/client/realtime'
import { useSound } from '@/lib/sound/SoundProvider'
import type { TrackingResponse } from '@/lib/client/types'
import { rupees, timeHM, StatusPill, RUN_STATUS_LABEL, Spinner, LoadError, EmptyState } from '../ui-bits'
import { slotLabel } from '@/lib/scheduling'
import { WarmBackdrop } from '../WarmBackdrop'
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
      <WarmBackdrop />
      <button onClick={() => go('#/')} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Home
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
      </div>
    </div>
  )
}

function TrackingInner({ code, go }: { code: string; go: (p: string) => void }) {
  const [order, setOrder] = useState<TrackingResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [retryOpen, setRetryOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)

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
  const { play } = useSound()
  useRealtime([`order:${code.toUpperCase()}`], (event) => {
    // the tracking screen has a voice: kitchen acceptance, readiness and
    // delivery each land as a distinct cue (mirrors the haptic pattern)
    if (event === 'ticket:status') play('pop')
    else if (event === 'order:paid') play('success')
    else if (event === 'order:update' || event === 'ticket:cancelled') play('notif')
    void load()
  })

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

  // THE ACCEPT WINDOW: cancelable only while every store leg is still NEW.
  // Once any kitchen taps Accept the window is gone — server enforces it too.
  const canCancel =
    order.paymentStatus === 'PAID' &&
    order.status !== 'CANCELLED' &&
    order.stores.length > 0 &&
    order.stores.every((s) => s.status === 'NEW')
  const lockedByAccept =
    order.paymentStatus === 'PAID' &&
    !canCancel &&
    order.status !== 'COMPLETED' &&
    order.status !== 'CANCELLED' &&
    !order.stores.some((s) => s.status === 'CANCELLED')

  const cancelOrder = async () => {
    setCancelling(true)
    try {
      const res = await post<{ cancelled: boolean; refund: { provider: string; status: string; amountPaise: number } }>(
        `/api/orders/${encodeURIComponent(order.code)}/cancel`,
        {},
      )
      toast.success('Order cancelled — money is on its way back', {
        description: `${rupees(res.refund.amountPaise)} returns to your original payment method (typically 5–7 working days).`,
        duration: 8000,
      })
      setCancelOpen(false)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not cancel the order')
      setCancelOpen(false)
    } finally {
      setCancelling(false)
      void load()
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16 pt-6">
      <WarmBackdrop />
      <button onClick={() => go('#/')} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Home
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
        {order.scheduledFor && (
          <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs font-bold text-sky-800 ring-1 ring-sky-200">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden /> Scheduled for {slotLabel(order.scheduledFor)} — the kitchen starts ~10 minutes before so food lands right on time
          </p>
        )}
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
                    ? 'You cancelled this store before it was prepared. Your other stores are unaffected.'
                    : 'Cancelled by the store — this leg will not be prepared. The counter will sort this part out for you in person.'}
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

      {/* bill + help */}
      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
          <ReceiptText className="h-3.5 w-3.5" aria-hidden /> Bill
        </h2>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Item total (GST incl. at store)</dt><dd className="tabular">{rupees(order.totals.subtotalPaise)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Platform fee (5% of total)</dt><dd className="tabular">{rupees(order.totals.platformFeePaise)}</dd></div>
          <div className="flex justify-between border-t border-border pt-1.5 font-black"><dt>Total paid</dt><dd className="tabular text-orange-600">{rupees(order.totals.totalPaise)}</dd></div>
        </dl>
      </section>

      {/* cancel window — closes the moment any store accepts */}
      {canCancel && (
        <section className="mt-4 rounded-2xl border border-stone-200 bg-card p-4">
          {!cancelOpen ? (
            <>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Changed your mind? The store hasn’t accepted yet — you can still cancel and the money returns to your original payment method automatically.
              </p>
              <button
                onClick={() => setCancelOpen(true)}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-red-300 bg-red-50 py-3 text-sm font-extrabold text-red-700 transition hover:bg-red-100"
              >
                <Undo2 className="h-4 w-4" aria-hidden /> Cancel order · {rupees(order.totals.totalPaise)} back to source
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-red-800">
                Really cancel? {rupees(order.totals.totalPaise)} returns to your payment method — this cannot be undone.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setCancelOpen(false)}
                  disabled={cancelling}
                  className="rounded-full border border-stone-300 bg-white py-3 text-sm font-bold text-foreground hover:bg-stone-50 disabled:opacity-50"
                >
                  Keep order
                </button>
                <button
                  onClick={cancelOrder}
                  disabled={cancelling}
                  className="rounded-full bg-red-600 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
                >
                  {cancelling ? 'Cancelling…' : 'Yes, cancel'}
                </button>
              </div>
            </>
          )}
        </section>
      )}
      {lockedByAccept && (
        <p role="status" className="mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] font-bold text-emerald-800">
          <Lock className="h-3.5 w-3.5" aria-hidden /> Accepted by the kitchen — your order is locked in and being made.
        </p>
      )}

      <button
        onClick={() => go(`#/support/${order.code}`)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3.5 text-sm font-bold text-foreground hover:bg-muted"
      >
        <CircleHelp className="h-4 w-4 text-orange-500" aria-hidden /> Help & support
      </button>

      <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
        Something wrong with your order? Talk to staff at the counter — they can see this order by its tracking number.
      </p>

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
