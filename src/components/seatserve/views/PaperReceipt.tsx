'use client'

// SeatServe — PaperReceipt: the post-payment bill printed like a thermal
// receipt sliding out of a POS slot. Just the slot + the paper (no machine
// body, no hands — owner's brief). Warm hardware tones, white thermal paper,
// monospace ink, torn zigzag bottom, scannable QR to the tracking screen.

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { rupees } from '../ui-bits'

export interface ReceiptData {
  seatCode?: string
  screenName?: string
  cinemaName?: string
  movie?: string
  groups: { storeName: string; emoji?: string | null; items: { name: string; qty: number; lineTotalPaise: number }[] }[]
  subtotalPaise: number
  platformFeePaise: number
  totalPaise: number
}

function printTime(): string {
  return new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()
}

/** Deterministic-looking "ticket number" from the order code (print filler). */
function refNumber(code: string): string {
  let h = 0
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return `${String(h % 9000 + 1000)} ${String(Math.floor(h / 7) % 900 + 100)} ${String(Math.floor(h / 13) % 9000 + 1000)}`
}

export default function PaperReceipt({
  data,
  orderCode,
  paidLine,
}: {
  data: ReceiptData
  orderCode: string
  /** e.g. "PAID — UPI ••••@okhdfc" */
  paidLine: string
}) {
  const [qr, setQr] = useState<string | null>(null)

  // scannable QR → tracking screen (matches the reference bill's QR)
  useEffect(() => {
    let cancelled = false
    const url = typeof window !== 'undefined' ? `${window.location.origin}/#/track/${orderCode}` : orderCode
    QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: '#292524', light: '#ffffff' } })
      .then((d) => {
        if (!cancelled) setQr(d)
      })
      .catch(() => {
        /* QR is decorative — bill stays complete without it */
      })
    return () => {
      cancelled = true
    }
  }, [orderCode])

  return (
    <div className="relative pt-1.5" aria-label="Payment receipt">
      {/* machine slot — just the slot, no machine body, no hands */}
      <div className="relative z-20 mx-auto flex h-7 max-w-[300px] items-center rounded-full bg-gradient-to-b from-stone-500 via-stone-600 to-stone-700 px-4 shadow-[0_10px_20px_-8px_rgba(87,60,24,0.55),inset_0_1px_0_rgba(255,255,255,0.35)]">
        <span className="slot-led h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300 shadow-[0_0_6px_2px_rgba(252,211,77,0.7)]" aria-hidden />
        <span className="mx-auto h-2 w-[74%] rounded-full bg-stone-950/80 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.8)]" aria-hidden />
        <span className="text-[7px] font-black tracking-[0.22em] text-stone-300/90" aria-hidden>
          SEATSERVE
        </span>
      </div>

      {/* the paper emerges from under the slot */}
      <div className="relative z-10 -mt-1 overflow-hidden pb-4">
        <article className="receipt-anim receipt-paper receipt-zigzag relative mx-auto w-full max-w-[300px] rounded-b-sm px-5 pb-7 pt-5 font-mono text-[12px] leading-relaxed text-stone-800" aria-live="polite">
          {/* printed header */}
          <div className="text-center">
            <p className="text-[15px] font-black tracking-[0.28em] text-stone-900">SEATSERVE</p>
            <p className="mt-0.5 text-[10px] font-semibold tracking-[0.14em] text-stone-500">
              {[data.cinemaName, data.screenName].filter(Boolean).join(' · ').toUpperCase()}
            </p>
            <p className="text-[10px] font-semibold tracking-[0.14em] text-stone-500">
              {data.seatCode ? `SEAT ${data.seatCode}` : ''} {data.movie ? `· ${data.movie.toUpperCase()}` : ''}
            </p>
          </div>

          <div className="my-3 border-t border-dashed border-stone-300" />

          {/* items grouped per store */}
          {data.groups.map((g) => (
            <div key={g.storeName} className="mb-2">
              <p className="text-[11px] font-black tracking-wide text-stone-700">
                {g.emoji ? `${g.emoji} ` : ''}
                {g.storeName.toUpperCase()}
              </p>
              <ul className="mt-0.5 space-y-0.5">
                {g.items.map((i) => (
                  <li key={i.name} className="flex items-baseline justify-between gap-3">
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

          {/* totals */}
          <dl className="space-y-0.5">
            <div className="flex justify-between">
              <dt className="text-stone-600">Subtotal</dt>
              <dd className="tabular">{rupees(data.subtotalPaise)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-600">Platform fee 5%</dt>
              <dd className="tabular">{rupees(data.platformFeePaise)}</dd>
            </div>
            <div className="mt-1 flex items-baseline justify-between border-t border-dashed border-stone-300 pt-1.5">
              <dt className="text-[14px] font-black tracking-wide text-stone-900">TOTAL</dt>
              <dd className="text-[16px] font-black tabular text-stone-900">{rupees(data.totalPaise)}</dd>
            </div>
          </dl>

          <div className="my-3 border-t border-dashed border-stone-300" />

          {/* paid line + code */}
          <p className="text-center text-[11px] font-bold tracking-wide text-stone-700">{paidLine.toUpperCase()}</p>
          <p className="mt-1 text-center text-[10px] tracking-wide text-stone-500">
            {printTime()} · REF {refNumber(orderCode)}
          </p>

          <p className="mt-3 text-center text-[9px] font-bold tracking-[0.2em] text-stone-500">YOUR TRACKING NUMBER</p>
          <p className="mt-0.5 text-center text-[19px] font-black tracking-[0.12em] text-stone-900 select-all">{orderCode}</p>

          <div className="receipt-barcode mx-auto mt-3 h-9 w-3/4 opacity-90" aria-hidden />

          {/* QR — scan to track this order */}
          <div className="mt-4 flex flex-col items-center">
            {qr ? (
              <img src={qr} alt={`QR code linking to live tracking of order ${orderCode}`} className="h-24 w-24 rounded-[2px] border border-stone-200 p-1" />
            ) : (
              <div className="h-24 w-24 animate-pulse rounded-[2px] bg-stone-100" aria-hidden />
            )}
            <p className="mt-1.5 text-[9px] font-bold tracking-[0.18em] text-stone-500">SCAN FOR LIVE TRACKING</p>
          </div>

          <p className="mt-4 text-center text-[11px] font-black tracking-[0.24em] text-stone-800">THANK YOU!</p>
          <p className="mt-0.5 text-center text-[9.5px] tracking-wide text-stone-500">ENJOY THE SHOW · NO DELIVERY FEE</p>
        </article>
      </div>
    </div>
  )
}
