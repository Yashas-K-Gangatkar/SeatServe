'use client'

// SeatServe — shared UI atoms
import { cn } from '@/lib/utils'
import { WifiOff, AlertTriangle, Loader2 } from 'lucide-react'

export function rupees(paise: number): string {
  const sign = paise < 0 ? '-' : ''
  const abs = Math.abs(paise)
  if (abs % 100 === 0) return `${sign}₹${(abs / 100).toLocaleString('en-IN')}`
  return `${sign}₹${(abs / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function timeHM(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

export function minAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`
}

export const TICKET_STATUS_STYLE: Record<string, string> = {
  NEW: 'bg-amber-400/15 text-amber-300 border-amber-400/30',
  ACCEPTED: 'bg-violet-400/15 text-violet-300 border-violet-400/30',
  PREPARING: 'bg-orange-400/15 text-orange-300 border-orange-400/30',
  READY_FOR_PICKUP: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
  PICKED_UP: 'bg-fuchsia-400/15 text-fuchsia-300 border-fuchsia-400/30',
  DELIVERED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  CANCELLED: 'bg-red-400/15 text-red-300 border-red-400/30',
}

export const TICKET_STATUS_LABEL: Record<string, string> = {
  NEW: 'New',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY_FOR_PICKUP: 'Ready for pickup',
  PICKED_UP: 'Picked up',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
}

export const RUN_STATUS_LABEL: Record<string, string> = {
  ASSIGNED: 'Runner assigned',
  PICKED_UP: 'Picked up',
  DELIVERED: 'Delivered',
}

export function StatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide',
        TICKET_STATUS_STYLE[status] ?? 'bg-muted text-muted-foreground border-border',
        className,
      )}
      role="status"
    >
      {status === 'PREPARING' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" aria-hidden />}
      {TICKET_STATUS_LABEL[status] ?? RUN_STATUS_LABEL[status] ?? status}
    </span>
  )
}

export function OfflineBanner({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div className="print-hide sticky top-0 z-50 flex items-center justify-center gap-2 bg-red-950/90 px-4 py-1.5 text-xs font-medium text-red-200" role="alert">
      <WifiOff className="h-3.5 w-3.5" aria-hidden /> You are offline — live updates paused
    </div>
  )
}

export function EmptyState({ icon, title, hint }: { icon?: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      {icon && <div className="text-muted-foreground/60">{icon}</div>}
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {hint && <p className="max-w-xs text-xs text-muted-foreground/70">{hint}</p>}
    </div>
  )
}

export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 px-6 py-8 text-center" role="alert">
      <AlertTriangle className="h-5 w-5 text-red-400" aria-hidden />
      <p className="text-sm text-red-200">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
          Try again
        </button>
      )}
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground" role="status" aria-live="polite">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      <span className="text-sm">{label ?? 'Loading…'}</span>
    </div>
  )
}

export function LiveDot({ connected }: { connected: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" aria-live="polite">
      <span
        className={cn('h-2 w-2 rounded-full', connected ? 'animate-pulse bg-emerald-400' : 'bg-red-400')}
        aria-hidden
      />
      <span className={connected ? 'text-emerald-400' : 'text-red-400'}>{connected ? 'Live' : 'Reconnecting…'}</span>
    </span>
  )
}

/** Veg / non-veg mark — the Indian FSSAI-style square/circle-in-box */
export function VegMark({ veg }: { veg: boolean }) {
  return (
    <span
      title={veg ? 'Vegetarian' : 'Non-vegetarian'}
      className={cn(
        'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border',
        veg ? 'border-emerald-500' : 'border-red-500',
      )}
      aria-label={veg ? 'Vegetarian' : 'Non-vegetarian'}
    >
      <span className={cn('h-2 w-2 rounded-full', veg ? 'bg-emerald-500' : 'bg-red-500')} aria-hidden />
    </span>
  )
}
