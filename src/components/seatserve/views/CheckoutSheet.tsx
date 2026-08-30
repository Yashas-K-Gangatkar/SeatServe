'use client'

// SeatServe — checkout sheet (bill breakdown) + sandbox payment sheet.
// The payment sheet talks to POST /api/orders (server computes money) and then
// POST /api/payments/mock-pay (sandbox gateway). No card/UPI secrets are ever sent —
// only a masked display string (e.g. "•••• 4242") the server may store for receipts.
import { useMemo, useState } from 'react'
import { Loader2, Lock, ShieldCheck, TriangleAlert, Timer, Store as StoreIcon, ChevronDown, CheckCircle2, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { post, ApiError } from '@/lib/client/api'
import { useCart } from '@/lib/client/cart'
import { rupees } from '../ui-bits'
import type { ContextResponse, OrderCreateResponse } from '@/lib/client/types'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

type Method = 'UPI' | 'CARD' | 'NETBANKING'

interface PlacedOrder {
  code: string
  totalPaise: number
}

export function CheckoutSheet({
  open,
  onOpenChange,
  ctx,
  onPlaced,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  ctx: ContextResponse
  onPlaced: (order: OrderCreateResponse) => void
}) {
  const cart = useCart()
  const [placing, setPlacing] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [placedOrder, setPlacedOrder] = useState<OrderCreateResponse | null>(null)

  const selection = useMemo(() => {
    const rows: { storeId: string; storeName: string; emoji: string | null; deliveryFeePaise: number; items: { id: string; name: string; qty: number; pricePaise: number; note: string }[] }[] = []
    for (const store of ctx.stores) {
      const items = store.products
        .map((p) => ({ id: p.id, name: p.name, qty: cart.lines[p.id]?.qty ?? 0, pricePaise: p.pricePaise, note: cart.lines[p.id]?.note ?? '' }))
        .filter((i) => i.qty > 0)
      if (items.length > 0) {
        rows.push({ storeId: store.id, storeName: store.name, emoji: store.emoji, deliveryFeePaise: store.deliveryFeePaise, items })
      }
    }
    return rows
  }, [ctx, cart.lines])

  const itemCount = selection.reduce((s, r) => s + r.items.reduce((x, i) => x + i.qty, 0), 0)
  const subtotal = selection.reduce((s, r) => s + r.items.reduce((x, i) => x + i.qty * i.pricePaise, 0), 0)
  const deliveryFees = selection.reduce((s, r) => s + r.deliveryFeePaise, 0)
  const pf = ctx.settings.platformFee
  const platformFee = Math.min(Math.max(Math.round((subtotal * pf.platformFeePct) / 100), pf.platformFeeMinPaise), pf.platformFeeMaxPaise)
  const estimatedTotal = subtotal + deliveryFees + platformFee

  // Audit fix #32: the estimate used a hardcoded "+12 min". It now mirrors the
  // server's real formula (slowest item + 2 min per extra unit + store buffer
  // + walk buffer) over the ACTUAL cart selection.
  const estDeliveryMin = useMemo(() => {
    const allProducts = ctx.stores.flatMap((s) => s.products)
    let maxPrep = 0
    for (const r of selection) {
      const store = ctx.stores.find((s) => s.id === r.storeId)
      if (!store) continue
      const preps = r.items.map((i) => allProducts.find((p) => p.id === i.id)?.prepEstimateMin ?? 8)
      const slowest = Math.max(...preps, 0)
      const extraUnits = r.items.reduce((sum, i) => sum + i.qty - 1, 0)
      maxPrep = Math.max(maxPrep, slowest + extraUnits * 2 + store.prepBufferMin)
    }
    return maxPrep + ctx.settings.platformFee.walkBufferMin
  }, [selection, ctx])

  const placeOrder = async () => {
    if (!ctx.showtime?.cutoff.orderingOpen) {
      toast.error('Ordering is closed for this show')
      return
    }
    setPlacing(true)
    try {
      const items = selection.flatMap((r) =>
        r.items.map((i) => ({ productId: i.id, qty: i.qty, ...(i.note.trim() ? { notes: i.note.trim() } : {}) })),
      )
      const order = await post<OrderCreateResponse>('/api/orders', {
        qrToken: ctx.seat.qrToken,
        items,
        customerName: name.trim() || undefined,
        customerPhone: phone.trim() || undefined,
      })
      // keep the checkout mounted; the payment sheet opens on top.
      // Navigation happens when the payment sheet closes (paid or "pay later").
      setPlacedOrder(order)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not place order')
    } finally {
      setPlacing(false)
    }
  }

  return (
    <>
      <Sheet open={open && !placedOrder} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto kitchen-scroll rounded-t-3xl border-border bg-popover p-0 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto">
          <SheetHeader className="p-5 pb-0">
            <SheetTitle className="text-left">Your cart · Seat {ctx.seat.code}</SheetTitle>
            <SheetDescription className="text-left">
              One cart, {selection.length} store{selection.length === 1 ? '' : 's'} · one payment, split automatically
            </SheetDescription>
          </SheetHeader>

          <div className="px-5 pb-6 pt-3">
            {selection.map((r) => (
              <div key={r.storeId} className="mb-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-orange-600">
                  <StoreIcon className="h-3.5 w-3.5" aria-hidden /> {r.emoji} {r.storeName}
                </p>
                <ul className="space-y-2">
                  {r.items.map((i) => (
                    <li key={i.id} className="rounded-xl border border-border bg-card p-3">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-semibold">
                          {i.name} <span className="text-muted-foreground">× {i.qty}</span>
                        </span>
                        <span className="font-bold tabular">{rupees(i.qty * i.pricePaise)}</span>
                      </div>
                      <input
                        value={i.note}
                        onChange={(e) => cart.setNote(i.id, e.target.value)}
                        placeholder="Note for kitchen (e.g. no onion — allergy)"
                        maxLength={200}
                        className="mt-2 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        aria-label={`Kitchen note for ${i.name}`}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {/* bill */}
            <div className="rounded-2xl border border-border bg-card p-4 text-sm" aria-label="Bill breakdown">
              <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Bill details</h3>
              <dl className="space-y-1.5">
                <div className="flex justify-between"><dt className="text-muted-foreground">Item total (GST incl.)</dt><dd className="tabular">{rupees(subtotal)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Delivery · {selection.length} store{selection.length === 1 ? '' : 's'}</dt><dd className="tabular">{rupees(deliveryFees)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Platform fee ({pf.platformFeePct}%)</dt><dd className="tabular">{rupees(platformFee)}</dd></div>
                <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-black"><dt>Estimated total</dt><dd className="text-orange-600 tabular">{rupees(estimatedTotal)}</dd></div>
              </dl>
              <p className="mt-1 text-[10px] text-muted-foreground">Final bill is computed server-side at placement.</p>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Timer className="h-3 w-3" aria-hidden /> Est. delivery ~{estDeliveryMin} min · ordering closes {ctx.showtime ? new Date(ctx.showtime.cutoff.cutoffAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
              </p>
            </div>

            {/* contact */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" maxLength={80} aria-label="Your name (optional)" />
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" maxLength={20} aria-label="Your phone (optional)" />
            </div>

            <button
              onClick={placeOrder}
              disabled={placing || itemCount === 0}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-b from-amber-500 to-orange-500 py-3.5 text-sm font-extrabold text-white shadow-md shadow-orange-500/30 hover:from-amber-600 hover:to-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:opacity-50"
            >
              {placing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
              Continue to pay ~{rupees(estimatedTotal)}
            </button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">Sandbox demo — you will see a mock payment sheet, no real money moves.</p>
          </div>
        </SheetContent>
      </Sheet>

      <PaymentSheet
        order={placedOrder ? { code: placedOrder.code, totalPaise: placedOrder.breakdown.totalPaise } : null}
        onClose={(paid) => {
          if (paid) cart.clear()
          const order = placedOrder
          setPlacedOrder(null)
          onOpenChange(false)
          if (order) onPlaced(order)
        }}
      />
    </>
  )
}

export function PaymentSheet({ order, onClose }: { order: PlacedOrder | null; onClose: (paid: boolean) => void }) {
  const [method, setMethod] = useState<Method>('UPI')
  const [vpa, setVpa] = useState('priya@okhdfcbank')
  const [card, setCard] = useState('4242 4242 4242 4242')
  const [failure, setFailure] = useState(false)
  const [phase, setPhase] = useState<'form' | 'processing' | 'failed' | 'unknown' | 'paid'>('form')
  const [failMsg, setFailMsg] = useState('')

  if (!order) return null

  const pay = async () => {
    // Audit fix #10: double-tapping "Pay" used to fire two concurrent payment
    // attempts. One attempt at a time, and a fresh idempotency key per attempt.
    if (phase !== 'form') return
    setPhase('processing')
    // a touch of theatre — real gateways take a few seconds
    await new Promise((r) => setTimeout(r, 1600))
    try {
      const methodDetail =
        method === 'UPI' ? vpa.replace(/(.{2}).*(@.*)/, '$1•••$2') : method === 'CARD' ? `•••• ${card.replace(/\D/g, '').slice(-4)}` : 'Netbanking · HDFC'
      const res = await post<{ providerRef: string; outcome: string; orderPaymentStatus: string; orderCode?: string }>('/api/payments/mock-pay', {
        orderCode: order.code,
        method,
        methodDetail,
        outcome: failure ? 'failure' : 'success',
        failureReason: failure ? 'Insufficient balance (simulated)' : undefined,
        idempotencyKey: crypto.randomUUID(),
      })
      if (res.outcome === 'failed') {
        setFailMsg('Payment declined by bank (simulated). Try again or switch method.')
        setPhase('failed')
        return
      }
      // Order confirmed — show the tracking code BEFORE navigating so the
      // customer can copy/share it (it is the only way back to this order).
      toast.success('Payment successful', { description: `Order ${order.code} · ${rupees(order.totalPaise)}` })
      setPhase('paid')
    } catch (err) {
      // Audit fix #33: a network drop mid-payment does NOT mean failure — the
      // webhook may still capture. Never lie about the money state.
      const status = err instanceof ApiError ? err.status : 0
      if (status === 0 || status >= 500) {
        setPhase('unknown')
        return
      }
      setFailMsg(err instanceof ApiError ? err.message : 'Payment failed')
      setPhase('failed')
    }
  }

  return (
    <Sheet open onOpenChange={(v) => !v && phase !== 'processing' && onClose(false)}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-md rounded-t-3xl border-border bg-popover p-0 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto">
        <SheetHeader className="p-5 pb-0">
          <SheetTitle className="flex items-center gap-2 text-left">
            {phase === 'paid' ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> Order confirmed
              </>
            ) : (
              <>
                <Lock className="h-4 w-4 text-orange-500" aria-hidden /> Secure payment
              </>
            )}
          </SheetTitle>
          <SheetDescription className="text-left">
            Order {order.code} · <span className="font-bold text-foreground">{rupees(order.totalPaise)}</span>
            {phase !== 'paid' && ' · SANDBOX (mock gateway)'}
          </SheetDescription>
        </SheetHeader>

        <div className="px-5 pb-6 pt-4">
          {phase === 'paid' ? (
            <div className="py-2" role="status">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                <p className="text-sm font-bold text-emerald-800">Payment received — your order is in the kitchens</p>
                <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-emerald-700/80">Your tracking number</p>
                <p className="mt-1 select-all text-3xl font-black tracking-[0.14em] text-stone-900">{order.code}</p>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(order.code)
                      toast.success('Tracking number copied')
                    } catch {
                      toast.error('Copy failed — long-press the code to copy it')
                    }
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-xs font-extrabold text-white hover:bg-stone-800"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden /> Copy tracking number
                </button>
                <p className="mt-3 text-[11px] leading-relaxed text-emerald-800/80">
                  Save or share this code — anyone who has it can follow this order on the Track your order screen, like a parcel tracking number.
                </p>
              </div>
              <button
                onClick={() => onClose(true)}
                className="mt-4 w-full rounded-full bg-gradient-to-b from-amber-500 to-orange-500 py-3.5 text-sm font-extrabold text-white shadow-md shadow-orange-500/30 hover:from-amber-600 hover:to-orange-600"
              >
                Track my order
              </button>
            </div>
          ) : phase === 'processing' ? (
            <div className="flex flex-col items-center gap-3 py-10" role="status" aria-live="polite">
              <Loader2 className="h-8 w-8 animate-spin text-orange-500" aria-hidden />
              <p className="text-sm font-semibold">Contacting bank{method === 'UPI' ? ' (UPI)' : ''}…</p>
              <p className="text-xs text-muted-foreground">Do not close this window</p>
            </div>
          ) : phase === 'unknown' ? (
            <div className="py-4" role="alert">
              <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden />
                <div>
                  <p className="text-sm font-bold text-amber-900">We could not confirm your payment</p>
                  <p className="mt-1 text-xs text-amber-800/90">
                    The connection dropped while the payment was being processed. Do NOT pay again — check the order status
                    first; if it shows PAID the money went through, otherwise retry from there.
                  </p>
                </div>
              </div>
              <button onClick={() => onClose(false)} className="mt-4 w-full rounded-full bg-gradient-to-b from-amber-500 to-orange-500 py-3 text-sm font-extrabold text-white shadow-md shadow-orange-500/30 hover:from-amber-600 hover:to-orange-600">
                Check order status
              </button>
            </div>
          ) : phase === 'failed' ? (
            <div className="py-4" role="alert">
              <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-500" aria-hidden />
                <div>
                  <p className="text-sm font-bold text-red-800">Payment failed</p>
                  <p className="mt-1 text-xs text-red-700/90">{failMsg}</p>
                </div>
              </div>
              <button onClick={() => setPhase('form')} className="mt-4 w-full rounded-full bg-gradient-to-b from-amber-500 to-orange-500 py-3 text-sm font-extrabold text-white shadow-md shadow-orange-500/30 hover:from-amber-600 hover:to-orange-600">
                Retry payment
              </button>
              <button onClick={() => onClose(false)} className="mt-2 w-full rounded-full border border-stone-300 bg-white py-3 text-sm font-bold text-stone-700 hover:bg-stone-50">
                Pay later from tracking
              </button>
            </div>
          ) : (
            <>
              {/* method tabs */}
              <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Payment method">
                {(['UPI', 'CARD', 'NETBANKING'] as Method[]).map((m) => (
                  <button
                    key={m}
                    role="tab"
                    aria-selected={method === m}
                    onClick={() => setMethod(m)}
                    className={`rounded-xl border px-2 py-2.5 text-xs font-extrabold transition ${method === m ? 'border-orange-400 bg-orange-50 text-orange-700 shadow-sm' : 'border-stone-200 bg-white text-stone-500 hover:bg-stone-50'}`}
                  >
                    {m === 'NETBANKING' ? 'NET BANK' : m}
                  </button>
                ))}
              </div>

              <div className="mt-3">
                {method === 'UPI' && (
                  <div>
                    <label htmlFor="vpa" className="mb-1 block text-xs font-semibold text-muted-foreground">UPI ID</label>
                    <Input id="vpa" value={vpa} onChange={(e) => setVpa(e.target.value)} placeholder="name@okbank" className="bg-background" />
                  </div>
                )}
                {method === 'CARD' && (
                  <div>
                    <label htmlFor="card" className="mb-1 block text-xs font-semibold text-muted-foreground">Card number (demo — we never store it)</label>
                    <Input id="card" value={card} onChange={(e) => setCard(e.target.value)} inputMode="numeric" className="bg-background" />
                    <p className="mt-1 text-[11px] text-muted-foreground">Only the last 4 digits reach the server, masked for display.</p>
                  </div>
                )}
                {method === 'NETBANKING' && (
                  <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
                    You will be redirected to your bank (simulated). Sandbox approves instantly.
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5">
                <span className="text-xs font-semibold text-amber-800">Simulate a failed payment</span>
                <Switch checked={failure} onCheckedChange={setFailure} aria-label="Simulate payment failure" />
              </div>

              <button
                onClick={pay}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-b from-amber-500 to-orange-500 py-3.5 text-sm font-extrabold text-white shadow-md shadow-orange-500/30 hover:from-amber-600 hover:to-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden /> Pay {rupees(order.totalPaise)}
              </button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
