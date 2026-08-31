'use client'

// /scan — full-screen seat-QR scanner.
// Camera via getUserMedia; detection via native BarcodeDetector when available,
// jsQR fallback everywhere else. Success animates (green check + confetti) and
// routes to /?qr=<token>, which the app normalizes into the seat flow.
// Desktop/no-camera users get manual entry + a one-tap demo seat.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import jsQR from 'jsqr'
import { ArrowLeft, Flashlight, FlashlightOff, Keyboard, Popcorn, ScanLine } from 'lucide-react'
import { toast } from 'sonner'
import { get } from '@/lib/client/api'

// Seat QR alphabet from src/lib/ids.ts — 10 chars, no 0/O/1/I.
const TOKEN_RE = /^[A-HJ-NP-Z2-9]{10}$/

function extractToken(raw: string): string | null {
  const s = raw.trim()
  try {
    const u = new URL(s)
    const q = u.searchParams.get('qr')
    if (q && TOKEN_RE.test(q.toUpperCase())) return q.toUpperCase()
  } catch {
    /* not a URL — fine */
  }
  if (TOKEN_RE.test(s.toUpperCase())) return s.toUpperCase()
  return null
}

function Confetti() {
  const pieces = Array.from({ length: 14 }, (_, i) => ({
    left: `${6 + Math.random() * 88}%`,
    dx: `${Math.round(Math.random() * 60 - 30)}px`,
    rot: `${Math.round(Math.random() * 540 - 270)}deg`,
    delay: `${(Math.random() * 0.25).toFixed(2)}s`,
    color: ['#D4AF37', '#22C55E', '#F59E0B', '#F43F5E'][i % 4],
  }))
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="ss-confetti-piece"
          style={{ left: p.left, background: p.color, animationDelay: p.delay, ['--dx' as never]: p.dx, ['--rot' as never]: p.rot } as React.CSSProperties}
        />
      ))}
    </div>
  )
}

type Phase = 'idle' | 'starting' | 'camera' | 'success'

export default function ScanPage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [camErr, setCamErr] = useState<string | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [torchable, setTorchable] = useState(false)
  const [shakeKey, setShakeKey] = useState(0)
  const [manualOpen, setManualOpen] = useState(false)
  const [manual, setManual] = useState('')

  const stopCamera = useCallback(() => {
    if (loopRef.current) clearInterval(loopRef.current)
    loopRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setTorchOn(false)
    setTorchable(false)
  }, [])

  const succeed = useCallback(
    (token: string) => {
      setPhase('success')
      navigator.vibrate?.(60)
      window.setTimeout(() => {
        stopCamera()
        router.push(`/?qr=${token}`)
      }, 950)
    },
    [router, stopCamera],
  )

  const handleFrame = useCallback(
    async (video: HTMLVideoElement) => {
      try {
        const w = video.videoWidth
        const h = video.videoHeight
        if (!w || !h) return
        let raw: string | null = null
        type DetectorLike = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> }
        const Ctor = (window as unknown as { BarcodeDetector?: new (o?: { formats?: string[] }) => DetectorLike }).BarcodeDetector
        if (Ctor) {
          const detector = new Ctor({ formats: ['qr_code'] })
          const codes = await detector.detect(video)
          if (codes.length > 0) raw = codes[0].rawValue
        } else {
          const canvas = document.createElement('canvas')
          const scale = Math.min(1, 640 / w)
          canvas.width = Math.round(w * scale)
          canvas.height = Math.round(h * scale)
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (!ctx) return
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const res = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
          if (res?.data) raw = res.data
        }
        if (!raw) return
        const token = extractToken(raw)
        if (token) {
          succeed(token)
        } else {
          setShakeKey(Date.now())
          toast.error("Couldn't read — that's not a seat code", { duration: 4000 })
        }
      } catch {
        /* frame skipped */
      }
    },
    [succeed],
  )

  const startCamera = useCallback(async () => {
    setCamErr(null)
    setPhase('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play()
      }
      setPhase('camera')
      const track = stream.getVideoTracks()[0]
      setTorchable(Boolean(track.getCapabilities?.().torch))
      loopRef.current = setInterval(() => {
        const v = videoRef.current
        if (v && v.readyState >= 2) void handleFrame(v)
      }, 250)
    } catch (err) {
      setPhase('idle')
      setCamErr(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow the camera, or enter your seat code below.'
          : 'No camera available here — enter your seat code below instead.',
      )
    }
  }, [handleFrame])

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] } as MediaTrackConstraints)
      setTorchOn((v) => !v)
    } catch {
      toast.error('Torch not available on this camera', { duration: 4000 })
    }
  }, [torchOn])

  const tryDemoSeat = useCallback(async () => {
    try {
      const entry = await get<{ aurora: { qrToken: string } | null }>('/api/demo/entry')
      if (entry?.aurora?.qrToken) succeed(entry.aurora.qrToken)
      else toast.error('Demo seat is loading — try again in a second', { duration: 4000 })
    } catch {
      toast.error('Could not reach the demo — check your connection', { duration: 4000 })
    }
  }, [succeed])

  const submitManual = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const token = extractToken(manual)
      if (!token) {
        setShakeKey(Date.now())
        toast.error('Seat codes look like A7K2M9QRTX — 10 characters', { duration: 4000 })
        return
      }
      succeed(token)
    },
    [manual, succeed],
  )

  useEffect(() => stopCamera, [stopCamera])

  const dark = 'min-h-dvh bg-[#0B0B0C] text-white'

  if (phase === 'success') {
    return (
      <div className={`${dark} relative grid place-items-center`} role="status">
        <Confetti />
        <div className="flex flex-col items-center gap-4">
          <span className="grid h-24 w-24 place-items-center rounded-full bg-emerald-500 shadow-[0_0_60px_rgba(34,197,94,0.5)]">
            <ScanLine className="h-12 w-12 text-white" aria-hidden />
          </span>
          <p className="text-lg font-bold">Seat found — opening your menu…</p>
        </div>
      </div>
    )
  }

  return (
    <div className={dark}>
      {phase !== 'camera' ? (
        /* ── idle / permission screen ── */
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-6 py-12 text-center">
          <a href="/" className="flex items-center gap-1.5 text-[17px] font-extrabold" aria-label="SeatServe home">
            <Popcorn className="h-5 w-5 text-[#D4AF37]" aria-hidden /> SeatServe
          </a>
          <div>
            <h1 className="text-[32px] font-bold leading-tight tracking-tight">Scan your seat QR</h1>
            <p className="mt-2 text-[15px] leading-[1.6] text-stone-400">
              Point your camera at the QR sticker on the seat back or armrest. The menu opens by itself.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void startCamera()}
            disabled={phase === 'starting'}
            className="ss-pulse-ring inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] text-base font-bold text-[#1A1A1A] transition-all hover:bg-[#C39B2A] active:scale-[0.98] disabled:opacity-60"
          >
            <ScanLine className="h-5 w-5" aria-hidden />
            {phase === 'starting' ? 'Starting camera…' : 'Start camera'}
          </button>

          {camErr && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300" role="alert">
              {camErr}
            </p>
          )}

          <div className="w-full space-y-3">
            <button
              type="button"
              onClick={() => setManualOpen((v) => !v)}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-transparent text-[15px] font-bold text-stone-200 transition hover:bg-white/5 active:scale-[0.98]"
            >
              <Keyboard className="h-4 w-4" aria-hidden /> Enter seat code manually
            </button>
            {manualOpen && (
              <form onSubmit={submitManual} className="flex gap-2">
                <input
                  value={manual}
                  onChange={(e) => setManual(e.target.value.toUpperCase())}
                  maxLength={10}
                  autoFocus
                  placeholder="A7K2M9QRTX"
                  aria-label="Seat code"
                  className="h-12 min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-4 font-mono text-lg tracking-[0.2em] text-white placeholder:text-stone-600 focus:border-[#D4AF37] focus:outline-none"
                />
                <button type="submit" className="h-12 shrink-0 rounded-xl bg-[#D4AF37] px-5 text-[15px] font-bold text-[#1A1A1A] active:scale-[0.98]">
                  Go
                </button>
              </form>
            )}
            <button
              type="button"
              onClick={() => void tryDemoSeat()}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 text-sm font-semibold text-stone-400 transition hover:text-white"
            >
              No QR? Open the demo seat instead
            </button>
          </div>
        </div>
      ) : (
        /* ── live camera ── */
        <div className="relative h-dvh w-full overflow-hidden">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" aria-label="Camera view — point at the seat QR" />

          {/* vignette + viewfinder */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-black/45" />
            <div className="absolute left-1/2 top-1/2 h-[68vw] max-h-[420px] max-w-[420px] w-[68vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
              <span className="ss-scanline absolute left-3 right-3 h-0.5 rounded bg-[#D4AF37]/90 shadow-[0_0_12px_rgba(212,175,55,0.8)]" />
            </div>
            <div className="absolute left-1/2 top-1/2 h-[68vw] max-h-[420px] max-w-[420px] w-[68vw] -translate-x-1/2 -translate-y-1/2 rounded-3xl">
              <span className="absolute left-0 top-0 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-[#D4AF37]" />
              <span className="absolute right-0 top-0 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-[#D4AF37]" />
              <span className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-[#D4AF37]" />
              <span className="absolute bottom-0 right-0 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-[#D4AF37]" />
            </div>
            <p className="absolute inset-x-0 top-[calc(50%+36vw)] text-center text-sm font-semibold text-white/85 sm:top-[calc(50%+220px)]">
              Tap to focus · hold steady
            </p>
          </div>

          {/* controls */}
          <button
            type="button"
            onClick={() => {
              stopCamera()
              setPhase('idle')
            }}
            aria-label="Close scanner"
            className="absolute left-4 top-4 z-10 grid h-12 w-12 place-items-center rounded-full bg-black/50 backdrop-blur transition active:scale-95"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </button>
          {torchable && (
            <button
              type="button"
              onClick={() => void toggleTorch()}
              aria-label={torchOn ? 'Turn torch off' : 'Turn torch on'}
              className={`absolute right-4 top-4 z-10 grid h-12 w-12 place-items-center rounded-full backdrop-blur transition active:scale-95 ${torchOn ? 'bg-[#D4AF37] text-[#1A1A1A]' : 'bg-black/50'}`}
            >
              {torchOn ? <Flashlight className="h-5 w-5" aria-hidden /> : <FlashlightOff className="h-5 w-5" aria-hidden />}
            </button>
          )}
          <div className="absolute inset-x-0 bottom-6 z-10 flex justify-center">
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-black/55 px-5 py-3 text-sm font-bold text-white backdrop-blur transition active:scale-[0.98]"
            >
              <Keyboard className="h-4 w-4" aria-hidden /> Type the code instead
            </button>
          </div>
          {manualOpen && (
            <div className="absolute inset-x-0 bottom-24 z-20 flex justify-center px-6">
              <form onSubmit={submitManual} className={`flex w-full max-w-sm gap-2 rounded-2xl border border-white/15 bg-black/70 p-3 backdrop-blur ${shakeKey ? '' : ''}`} key={shakeKey}>
                <input
                  value={manual}
                  onChange={(e) => setManual(e.target.value.toUpperCase())}
                  maxLength={10}
                  autoFocus
                  placeholder="A7K2M9QRTX"
                  aria-label="Seat code"
                  className={`h-12 min-w-0 flex-1 rounded-xl border border-white/15 bg-white/10 px-4 font-mono text-lg tracking-[0.2em] text-white placeholder:text-stone-500 focus:border-[#D4AF37] focus:outline-none ${shakeKey ? 'ss-shake' : ''}`}
                />
                <button type="submit" className="h-12 shrink-0 rounded-xl bg-[#D4AF37] px-5 text-[15px] font-bold text-[#1A1A1A] active:scale-[0.98]">
                  Go
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
