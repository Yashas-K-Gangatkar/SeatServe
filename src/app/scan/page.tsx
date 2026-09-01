'use client'

/**
 * /scan — dark focus page for scanning the seat QR.
 * Camera scan uses the BarcodeDetector API where available; every fallback
 * (no API, no camera permission, manual entry) degrades gracefully and the
 * page stays fully usable. Scanned tokens deep-link into the hash-router
 * app (#/seat/<token>), matching the printed stickers' ?qr= flow.
 */
import { useEffect, useRef, useState } from 'react'
import { Keyboard, Popcorn, ScanLine } from 'lucide-react'
import { get } from '@/lib/client/api'

interface DemoEntry {
  aurora: { qrToken: string; seat: string } | null
}

type ScanState = 'idle' | 'starting' | 'scanning' | 'unsupported' | 'denied'

export default function ScanPage() {
  const [state, setState] = useState<ScanState>('idle')
  const [manualOpen, setManualOpen] = useState(false)
  const [code, setCode] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)
  const [demoToken, setDemoToken] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // demo seat for the fallbacks
  useEffect(() => {
    let cancelled = false
    void get<DemoEntry>('/api/demo/entry')
      .then((entry) => {
        if (!cancelled && entry?.aurora?.qrToken) setDemoToken(entry.aurora.qrToken)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  // camera lifecycle cleanup
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const startCamera = async () => {
    setState('starting')
    try {
      const Detector = (
        window as unknown as {
          BarcodeDetector?: new (opts: { formats: string[] }) => {
            detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]>
          }
        }
      ).BarcodeDetector
      if (!Detector) {
        setState('unsupported')
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setState('scanning')
      const detector = new Detector({
        formats: ['qr_code'],
      })
      const tick = async () => {
        if (!videoRef.current || streamRef.current === null) return
        try {
          const found = await detector.detect(videoRef.current)
          if (found.length > 0) {
            const raw = found[0].rawValue
            const token =
              new URL(raw, window.location.origin).searchParams.get('qr') ?? raw
            streamRef.current?.getTracks().forEach((t) => t.stop())
            streamRef.current = null
            window.location.href = `/#/seat/${encodeURIComponent(token)}`
            return
          }
        } catch {
          /* keep scanning */
        }
        requestAnimationFrame(() => void tick())
      }
      void tick()
    } catch {
      setState('denied')
    }
  }

  const submitManual = async () => {
    const wanted = code.trim().toUpperCase()
    if (!wanted) return
    setManualError(null)
    try {
      const entry = await get<DemoEntry>('/api/demo/entry')
      const seat = entry?.aurora?.seat?.toUpperCase()
      if (seat && (wanted === seat || wanted === seat.replace(/[^\dA-Z]/g, ''))) {
        if (entry?.aurora?.qrToken) {
          window.location.href = `/#/seat/${encodeURIComponent(entry.aurora.qrToken)}`
          return
        }
      }
      setManualError(
        `Seat ${wanted} isn't part of this pilot hall yet — try the demo seat below.`,
      )
    } catch {
      setManualError('Could not look up seats right now. Try again shortly.')
    }
  }

  return (
    <div className="min-h-dvh bg-[#0B0B0C] text-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-6 py-12 text-center">
        <a
          href="/"
          className="flex items-center gap-1.5 text-[17px] font-extrabold"
          aria-label="SeatServe home"
        >
          <Popcorn className="h-5 w-5 text-[#D4AF37]" aria-hidden />
          SeatServe
        </a>

        <div>
          <h1 className="text-[32px] font-bold leading-tight tracking-tight">
            Scan your seat QR
          </h1>
          <p className="mt-2 text-[15px] leading-[1.6] text-stone-400">
            Point your camera at the QR sticker on the seat back or armrest.
            The menu opens by itself.
          </p>
        </div>

        {state === 'scanning' ? (
          <div className="relative w-full overflow-hidden rounded-xl border border-[#D4AF37]/40">
            <video ref={videoRef} muted playsInline className="aspect-[3/4] w-full object-cover" aria-label="Camera viewfinder" />
            <div className="ss-scanline absolute inset-x-4 h-0.5 rounded-full bg-[#D4AF37] shadow-[0_0_12px_rgba(212,175,55,0.9)]" aria-hidden />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void startCamera()}
            disabled={state === 'starting'}
            className="ss-pulse-ring inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] text-base font-bold text-[#1A1A1A] transition-all hover:bg-[#C39B2A] active:scale-[0.98] disabled:opacity-60"
          >
            <ScanLine className="h-5 w-5" aria-hidden />
            {state === 'starting' ? 'Starting camera…' : 'Start camera'}
          </button>
        )}

        {(state === 'unsupported' || state === 'denied') && (
          <p role="status" className="text-sm text-stone-400">
            {state === 'denied'
              ? 'Camera permission was blocked — enter your seat code below instead.'
              : 'This browser can’t scan QR codes — enter your seat code below instead.'}
          </p>
        )}

        <div className="w-full space-y-3">
          {manualOpen ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void submitManual()
              }}
            >
              <input
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. B7"
                aria-label="Seat code"
                aria-invalid={!!manualError}
                className="h-12 w-full rounded-xl border border-white/15 bg-transparent px-4 text-[15px] font-bold tracking-widest placeholder:font-normal placeholder:tracking-normal placeholder:text-stone-500 focus:border-[#D4AF37] focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl bg-[#D4AF37] px-5 text-[15px] font-bold text-[#1A1A1A] transition active:scale-[0.98]"
              >
                Go
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-transparent text-[15px] font-bold text-stone-200 transition hover:bg-white/5 active:scale-[0.98]"
            >
              <Keyboard className="h-4 w-4" aria-hidden />
              Enter seat code manually
            </button>
          )}
          {manualError && (
            <p role="alert" className="text-sm text-[#e0b64a]">
              {manualError}
            </p>
          )}
          <button
            type="button"
            disabled={!demoToken}
            onClick={() => {
              if (demoToken)
                window.location.href = `/#/seat/${encodeURIComponent(demoToken)}`
            }}
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 text-sm font-semibold text-stone-400 transition hover:text-white disabled:opacity-50"
          >
            No QR? Open the demo seat instead
          </button>
        </div>
      </div>
    </div>
  )
}
