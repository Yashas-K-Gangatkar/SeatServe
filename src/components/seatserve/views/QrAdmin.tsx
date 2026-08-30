'use client'

// SeatServe — seat QR generator (#/qr)
// Printable sheet: each QR encodes <origin>/?qr=<seatToken>; scanning opens that seat's menu.
import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, Printer, ScanLine } from 'lucide-react'
import { get, ApiError } from '@/lib/client/api'
import type { QrResponse } from '@/lib/client/types'
import StaffGate from '../StaffGate'
import { Spinner, LoadError } from '../ui-bits'

export default function QrAdmin({ go }: { go: (p: string) => void }) {
  return (
    <StaffGate roles={['MALL_ADMIN', 'CINEMA_MANAGER']} go={go} consoleName="Seat QR generator">
      {() => <QrSheet go={go} />}
    </StaffGate>
  )
}

function QrSheet({ go }: { go: (p: string) => void }) {
  const [data, setData] = useState<QrResponse | null>(null)
  const [screenId, setScreenId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(
    async (id?: string | null) => {
      try {
        setError(null)
        setData(await get<QrResponse>(`/api/admin/qr${id ? `?screenId=${encodeURIComponent(id)}` : ''}`))
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not load QR data')
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    setLoading(true)
    void load(screenId)
  }, [load, screenId])

  if (loading && !data) return <Spinner label="Generating QR codes…" />
  if (error)
    return (
      <div className="mx-auto max-w-md px-4 pt-16">
        <LoadError message={error} onRetry={() => load(screenId)} />
      </div>
    )
  if (!data) return null

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <div className="print-hide">
        <button onClick={() => go('#/admin')} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Admin board
        </button>

        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold tracking-[0.18em] text-orange-600">SEAT QR GENERATOR</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight">Printable seat codes</h1>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ScanLine className="h-3.5 w-3.5" aria-hidden /> Every QR encodes this preview origin: <code className="text-foreground">{data.origin}/?qr=…</code>
            </p>
          </div>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-amber-500 to-orange-500 px-4 py-2.5 text-xs font-extrabold text-white shadow-md shadow-orange-500/30 hover:from-amber-600 hover:to-orange-600"
          >
            <Printer className="h-4 w-4" aria-hidden /> Print sheet
          </button>
        </header>

        <div className="mt-4 flex flex-wrap gap-2">
          {data.screens.map((s) => (
            <button
              key={s.id}
              onClick={() => setScreenId(s.id)}
              className={`rounded-full border px-3.5 py-2 text-xs font-bold transition ${data.screen.id === s.id ? 'border-orange-400 bg-orange-50 text-orange-700 shadow-sm' : 'border-stone-300 bg-white text-stone-500 hover:bg-stone-50'}`}
              aria-pressed={data.screen.id === s.id}
            >
              {s.name} · {s.cinema.replace('Aurora Cineplex — ', '')}
            </button>
          ))}
        </div>
      </div>

      {/* printable grid — white background for print legibility */}
      <div className="print-area mt-6 grid grid-cols-3 gap-3 rounded-2xl bg-white p-4 sm:grid-cols-6" aria-label={`Seat QR codes for ${data.screen.name}`}>
        {data.seats.map((seat) => (
          <figure key={seat.qrToken} className="rounded-lg border border-gray-200 bg-white p-2 text-center">
            <img src={seat.dataUrl} alt={`QR code for seat ${seat.code}, ${data.screen.name}`} className="mx-auto h-auto w-full" />
            <figcaption className="mt-1">
              <p className="text-[13px] font-black leading-tight text-gray-900">{seat.code}</p>
              <p className="truncate text-[9px] font-semibold uppercase tracking-wide text-gray-500">
                {data.screen.name} · {data.screen.cinema.replace('Aurora Cineplex — ', '')}
              </p>
              <p className="truncate text-[8px] text-gray-400">{seat.qrToken}</p>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="print-hide mt-3 text-center text-[11px] text-muted-foreground">
        {data.seats.length} seats · scan any code from this screen to open that seat on a phone.
      </p>
    </div>
  )
}
