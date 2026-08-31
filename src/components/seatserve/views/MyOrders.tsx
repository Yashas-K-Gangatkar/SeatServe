'use client'

// SeatServe — "Your orders" strip on the seat page.
// Reads the orders this device placed from THIS seat (localStorage,
// best-effort) and shows their live status right on the menu — so a
// re-scan of the seat QR puts the customer straight back on top of their
// order, even if they never copied the tracking code.
import { useCallback, useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { get } from '@/lib/client/api'
import { usePolling } from '@/lib/client/realtime'
import type { TrackingResponse } from '@/lib/client/types'
import { rupees, StatusPill } from '../ui-bits'
import { ordersForSeat, type RememberedOrder } from '@/lib/client/orderMemory'

const DONE = new Set(['COMPLETED', 'CANCELLED'])

export function MyOrders({ seatToken, go, refreshToken }: { seatToken: string; go: (p: string) => void; refreshToken: number }) {
  const [orders, setOrders] = useState<TrackingResponse[] | null>(null)

  const load = useCallback(async () => {
    const remembered: RememberedOrder[] = ordersForSeat(seatToken)
    // codes are public capabilities — fetching them is the same call the
    // tracking page makes; failures (typo'd/expired) just drop the card
    const results = await Promise.all(
      remembered.map(async (o) => {
        try {
          return await get<TrackingResponse>(`/api/orders/${encodeURIComponent(o.code)}`)
        } catch {
          return null
        }
      }),
    )
    setOrders(results.filter((o): o is TrackingResponse => !!o))
  }, [seatToken])

  useEffect(() => {
    // deferred one tick: the fetch → setState chain must not run inside the
    // effect body itself (react-hooks/set-state-in-effect)
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load, refreshToken])
  usePolling(load, 10000, orders !== null && orders.some((o) => !DONE.has(o.status)))

  const active = (orders ?? []).filter((o) => !DONE.has(o.status))
  if (orders === null || active.length === 0) return null

  return (
    <section className="mt-4" aria-label="Your orders from this seat">
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
        Your orders here
      </h2>
      <div className="space-y-2">
        {active.map((o) => (
          <button
            key={o.code}
            onClick={() => go(`#/track/${o.code}`)}
            className="flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 text-left transition hover:bg-amber-100/70"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-extrabold tracking-[0.12em] text-orange-600">{o.code}</span>
                <StatusPill status={o.stores.find((s) => s.status !== 'CANCELLED')?.status ?? o.stores[0]?.status ?? o.status} />
              </div>
              <p className="mt-1 truncate text-xs text-stone-600">
                {o.stores
                  .filter((s) => s.status !== 'CANCELLED')
                  .map((s) => s.storeName)
                  .join(' + ') || 'Cancelled'}{' '}
                · {rupees(o.totals.totalPaise)}
                {!o.payment || o.paymentStatus !== 'PAID' ? ' · payment pending' : ''}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
          </button>
        ))}
      </div>
    </section>
  )
}
