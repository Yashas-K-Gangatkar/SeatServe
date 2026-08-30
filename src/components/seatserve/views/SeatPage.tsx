'use client'

// SeatServe — customer seat page (#/seat/<qrToken>)
// Mobile-first, dark-cinema friendly: big touch targets, high contrast, sticky cart bar.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Minus, Plus, ShoppingBag, Timer, Store as StoreIcon, ChevronLeft, MapPin, Ban, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { get, ApiError } from '@/lib/client/api'
import { useCart } from '@/lib/client/cart'
import type { ContextResponse, OrderCreateResponse } from '@/lib/client/types'
import { rupees, VegMark, Spinner, LoadError, EmptyState } from '../ui-bits'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { CheckoutSheet } from './CheckoutSheet'

export default function SeatPage({ qrToken, go }: { qrToken: string; go: (p: string) => void }) {
  const [ctx, setCtx] = useState<ContextResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [openStores, setOpenStores] = useState<Record<string, boolean>>({})

  const cart = useCart()
  const load = useCallback(async () => {
    try {
      setError(null)
      const data = await get<ContextResponse>(`/api/context?qr=${encodeURIComponent(qrToken)}`)
      setCtx(data)
      cart.switchSeat(qrToken)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load menu')
    } finally {
      setLoading(false)
    }
  }, [qrToken])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  const { lines } = cart
  const cartInfo = useMemo(() => {
    if (!ctx) return { count: 0, totalPaise: 0, storeCount: 0 }
    let count = 0
    let totalPaise = 0
    const stores = new Set<string>()
    for (const store of ctx.stores) {
      for (const p of store.products) {
        const line = lines[p.id]
        if (line?.qty) {
          count += line.qty
          totalPaise += p.pricePaise * line.qty
          stores.add(store.id)
        }
      }
    }
    return { count, totalPaise, storeCount: stores.size }
  }, [ctx, lines])

  if (loading) return <Spinner label="Opening your seat menu…" />
  if (error)
    return (
      <div className="mx-auto max-w-md px-4 pt-16">
        <LoadError message={error} onRetry={load} />
        <button onClick={() => go('#/')} className="mt-4 block w-full text-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          ← Back to demo home
        </button>
      </div>
    )
  if (!ctx) return null

  const show = ctx.showtime
  const cutoffClosed = show ? !show.cutoff.orderingOpen : true

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-32 pt-6">
      {/* seat header */}
      <header>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-extrabold tracking-[0.18em] text-violet-300">{ctx.mall.name.toUpperCase()} · DEMO</p>
          <button
            onClick={() => go('#/')}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
            aria-label="Back to demo home"
          >
            <ChevronLeft className="h-3 w-3" aria-hidden /> Home
          </button>
        </div>
        <h1 className="mt-2 text-3xl font-black leading-tight tracking-tight">
          {ctx.screen.name} · <span className="text-lime-300">Seat {ctx.seat.code}</span>
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          {ctx.cinema.name}
        </p>
        {show && (
          <div className="mt-3 rounded-2xl border border-border bg-card p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold">{show.movieTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {show.language ? `${show.language} · ` : ''}Starts {new Date(show.startsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              {cutoffClosed ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-bold text-red-300">
                  <Ban className="h-3 w-3" aria-hidden /> Ordering closed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                  <Timer className="h-3 w-3" aria-hidden /> {show.cutoff.minutesUntilCutoff}m left to order
                </span>
              )}
            </div>
          </div>
        )}
        {/* seat switcher (demo: pretend you scanned a different seat) */}
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none py-1 font-semibold hover:text-foreground">Not your seat? Switch seat (demo)</summary>
          <div className="mt-1 grid max-h-28 grid-cols-6 gap-1 overflow-y-auto kitchen-scroll rounded-xl border border-border bg-card p-2">
            {ctx.screenSeats.slice(0, 36).map((s) => (
              <button
                key={s.qrToken}
                onClick={() => go(`#/seat/${s.qrToken}`)}
                className={`rounded-lg px-1 py-1.5 text-[10px] font-bold tabular hover:bg-muted ${s.code === ctx.seat.code ? 'bg-lime-300/15 text-lime-300' : 'text-muted-foreground'}`}
              >
                {s.code}
              </button>
            ))}
          </div>
        </details>
      </header>

      {/* menu */}
      <section className="mt-6" aria-label="Food menu">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          <StoreIcon className="h-4 w-4" aria-hidden /> {ctx.stores.length} stores · one cart
        </h2>
        {ctx.stores.map((store) => {
          const open = openStores[store.id] ?? true
          return (
            <div key={store.id} className="mb-4 overflow-hidden rounded-2xl border border-border bg-card">
              <button
                className="flex w-full items-center justify-between gap-2 p-4 text-left"
                onClick={() => setOpenStores((s) => ({ ...s, [store.id]: !open }))}
                aria-expanded={open}
              >
                <div>
                  <p className="flex items-center gap-2 text-sm font-extrabold">
                    <span aria-hidden>{store.emoji}</span> {store.name}
                    {!store.isOpen && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-300">CLOSED</span>}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    ★ {store.rating.toFixed(1)} · prep ~{store.prepBufferMin + 8} min · delivery {rupees(store.deliveryFeePaise)}
                  </p>
                </div>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? '' : '-rotate-90'}`} aria-hidden />
              </button>
              {open && (
                <ul className="divide-y divide-border/60">
                  {store.products.map((p) => {
                    const line = lines[p.id]
                    const disabled = !p.isAvailable || !store.isOpen
                    return (
                      <li key={p.id} className={`flex items-center gap-3 px-4 py-3 ${disabled ? 'opacity-50' : ''}`}>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 text-sm font-semibold">
                            <VegMark veg={p.isVeg} /> {p.name}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">{p.description}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                            <span className="font-bold text-foreground tabular">{rupees(p.pricePaise)}</span>
                            <span>~{p.prepEstimateMin} min</span>
                            <span className="text-muted-foreground/70">GST {p.taxRatePct}% incl.</span>
                            {p.allergens && <span className="text-amber-300/80">allergens: {p.allergens}</span>}
                          </p>
                          {!p.isAvailable && <p className="mt-0.5 text-[11px] font-bold text-red-300">Sold out right now</p>}
                        </div>
                        {line?.qty ? (
                          <div className="flex items-center gap-1 rounded-full border border-lime-300/40 bg-lime-300/10 p-1" aria-label={`Quantity of ${p.name}: ${line.qty}`}>
                            <button
                              onClick={() => cart.remove(p.id)}
                              className="flex h-8 w-8 items-center justify-center rounded-full text-lime-200 hover:bg-lime-300/20 focus-visible:outline-2 focus-visible:outline-lime-300"
                              aria-label={`Remove one ${p.name}`}
                            >
                              <Minus className="h-4 w-4" aria-hidden />
                            </button>
                            <span className="w-5 text-center text-sm font-extrabold tabular">{line.qty}</span>
                            <button
                              onClick={() => cart.add(p.id)}
                              disabled={line.qty >= 20}
                              className="flex h-8 w-8 items-center justify-center rounded-full text-lime-200 hover:bg-lime-300/20 focus-visible:outline-2 focus-visible:outline-lime-300 disabled:opacity-40"
                              aria-label={`Add one ${p.name}`}
                            >
                              <Plus className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              cart.add(p.id)
                              toast.success(`${p.name} added`, { duration: 1200 })
                            }}
                            disabled={disabled}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-foreground hover:border-lime-300/50 hover:bg-lime-300/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={`Add ${p.name} to cart`}
                          >
                            <Plus className="h-4 w-4" aria-hidden />
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </section>

      {/* sticky cart bar */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 print-hide">
        <div className="mx-auto max-w-md px-4">
          <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-lime-300/25 bg-[#141a12]/95 p-3 shadow-2xl shadow-black/50 backdrop-blur">
            <div className="min-w-0">
              <p className="text-lg font-black leading-none text-lime-300 tabular">{rupees(cartInfo.totalPaise)}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {cartInfo.count} item{cartInfo.count === 1 ? '' : 's'} · {cartInfo.storeCount} store{cartInfo.storeCount === 1 ? '' : 's'}
              </p>
            </div>
            <button
              onClick={() => setCheckoutOpen(true)}
              disabled={cartInfo.count === 0 || cutoffClosed}
              className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-5 py-3 text-sm font-extrabold text-lime-950 transition hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ShoppingBag className="h-4 w-4" aria-hidden />
              {cutoffClosed ? 'Ordering closed' : 'View cart'}
            </button>
          </div>
        </div>
      </div>

      <CheckoutSheet
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        ctx={ctx}
        onPlaced={(order) => go(`#/track/${order.code}`)}
      />
    </div>
  )
}
