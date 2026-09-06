'use client'

// /onboard/print?blockId=… — printable DOOR QR sticker sheet for a freshly
// onboarded block. 8 stickers per A4 page, dashed cut lines, print-optimized
// CSS (navigation chrome disappears on print).
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { get } from '@/lib/client/api'

interface Sticker {
  name: string
  doorQrToken: string
  target: string
  dataUrl: string
}
interface QrSheet {
  campusName: string
  blockName: string
  stickers: Sticker[]
}

function PrintSheet() {
  const blockId = useSearchParams().get('blockId') ?? ''
  const [sheet, setSheet] = useState<QrSheet | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        setSheet(await get<QrSheet>(`/api/onboard/qr?blockId=${encodeURIComponent(blockId)}`))
      } catch {
        setError('Could not load the sticker sheet — check the link.')
      }
    }, 0)
    return () => clearTimeout(t)
  }, [blockId])

  if (error) return <main className="grid min-h-dvh place-items-center px-6 text-center text-sm font-bold text-red-700">{error}</main>
  if (!sheet) return <main className="grid min-h-dvh place-items-center text-sm text-muted-foreground">Preparing stickers…</main>

  return (
    <main className="min-h-dvh bg-stone-100 px-4 py-6 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <p className="text-sm font-extrabold text-stone-800">
            {sheet.campusName} · {sheet.blockName} — {sheet.stickers.length} door stickers
          </p>
          <button
            onClick={() => window.print()}
            className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-extrabold text-white hover:bg-orange-700"
          >
            Print (A4)
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 print:grid-cols-2">
          {sheet.stickers.map((s) => (
            <div
              key={s.doorQrToken}
              className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-stone-300 bg-white p-3 print:break-inside-avoid"
            >
              <img src={s.dataUrl} alt={`QR for ${s.name}`} className="h-28 w-28 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-orange-600">NotiFetch</p>
                <p className="truncate text-lg font-black leading-tight text-stone-900">{s.name}</p>
                <p className="mt-1 text-[11px] font-semibold leading-snug text-stone-600">
                  Scan to order · food delivered here at the break
                </p>
                <p className="mt-0.5 text-[9px] tracking-wider text-stone-400">{s.doorQrToken}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

export default function OnboardPrintPage() {
  return (
    <Suspense fallback={<main className="grid min-h-dvh place-items-center text-sm text-muted-foreground">Preparing stickers…</main>}>
      <PrintSheet />
    </Suspense>
  )
}
