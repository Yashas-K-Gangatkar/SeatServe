'use client'

// SeatServe Phase 3 — settlement & reconciliation panel (admin board section).
// Ledger-driven money view: per-store gross / commission / void adjustments
// adjustments / net payable, settlement batches (PENDING → PROCESSED with UTR),
// and the R1–R5 reconciliation health banner.

import { useCallback, useEffect, useState } from 'react'
import { Banknote, CheckCircle2, ClipboardList, ShieldCheck, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { get, post, ApiError } from '@/lib/client/api'
import { rupees, Spinner, LoadError, EmptyState } from '../ui-bits'

interface StoreSummary {
  storeId: string
  storeName: string
  storeSlug: string
  grossNetPaise: number
  commissionPaise: number
  taxPaise: number
  voidAdjustPaise: number
  netPayablePaise: number
  pendingRows: number
  settledRows: number
}

interface Batch {
  id: string
  storeName: string
  amountPaise: number
  status: string
  utr: string | null
  detail: { grossPaise: number; commissionPaise: number; taxPaise: number; voidAdjustPaise: number; netPayablePaise: number } | null
  createdAt: string
  processedAt: string | null
}

interface SettlementData {
  scope: string
  stores: StoreSummary[]
  batches: Batch[]
}

interface ReconciliationData {
  checkedAt: string
  ordersChecked: number
  healthy: boolean
  issues: { orderCode: string; check: string; expected: string; actual: string }[]
}

export default function SettlementPanel({ canAct }: { canAct: boolean }) {
  const [data, setData] = useState<SettlementData | null>(null)
  const [recon, setRecon] = useState<ReconciliationData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setError(null)
      const [s, r] = await Promise.all([get<SettlementData>('/api/admin/settlement'), get<ReconciliationData>('/api/admin/reconciliation')])
      setData(s)
      setRecon(r)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load settlement data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const runBatch = async () => {
    setBusy(true)
    try {
      const res = await post<{ batches: { storeName: string }[]; skipped: string[] }>('/api/admin/settlement', {})
      toast.success(`Settlement batch created for ${res.batches.map((b) => b.storeName).join(', ')}`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create batch')
    } finally {
      setBusy(false)
      void load()
    }
  }

  const processBatch = async (id: string, storeName: string) => {
    setBusy(true)
    try {
      const res = await post<{ utr: string; amountPaise: number }>(`/api/admin/settlement/${id}/process`, {})
      toast.success(`${storeName}: ${rupees(res.amountPaise)} transferred · UTR ${res.utr}`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Transfer failed')
    } finally {
      setBusy(false)
      void load()
    }
  }

  if (loading && !data) return <Spinner label="Loading settlement ledger…" />
  if (error)
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <LoadError message={error} onRetry={load} />
      </div>
    )
  if (!data) return null

  const pendingBatches = data.batches.filter((b) => b.status === 'PENDING')

  return (
    <section className="mt-6 space-y-3" aria-label="Settlement and reconciliation">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Money · settlement & reconciliation</h2>
        {canAct && (
          <button
            onClick={runBatch}
            disabled={busy}
            className="rounded-full bg-gradient-to-b from-amber-500 to-orange-500 px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm shadow-orange-500/30 transition hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
          >
            <ClipboardList className="mr-1 inline h-3 w-3" aria-hidden /> Run settlement batch
          </button>
        )}
      </div>

      {/* reconciliation health */}
      {recon && (
        <div className={`rounded-2xl border p-4 ${recon.healthy ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'}`} role="status">
          <p className={`flex items-center gap-2 text-sm font-bold ${recon.healthy ? 'text-emerald-800' : 'text-red-800'}`}>
            {recon.healthy ? <ShieldCheck className="h-4 w-4" aria-hidden /> : <ShieldAlert className="h-4 w-4" aria-hidden />}
            Ledger {recon.healthy ? 'reconciled' : 'needs attention'} · {recon.ordersChecked} order{recon.ordersChecked === 1 ? '' : 's'} verified (R1–R5)
          </p>
          {recon.issues.length > 0 && (
            <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-red-700">
              {recon.issues.slice(0, 6).map((i, idx) => (
                <li key={`${i.orderCode}-${i.check}-${idx}`}>
                  <b>{i.orderCode}</b> · {i.check}: expected {i.expected}, got {i.actual}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* per-store settlement summary */}
      {data.stores.length === 0 ? (
        <EmptyState title="No stores in scope" hint="Settlement appears once stores exist in your mall." />
      ) : (
        <ul className="space-y-2">
          {data.stores.map((s) => (
            <li key={s.storeId} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">{s.storeName}</p>
                <p className="text-sm font-black tabular text-orange-600">{rupees(s.netPayablePaise)}</p>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] sm:grid-cols-3">
                <div className="rounded-lg bg-background px-2 py-1.5">
                  <dt className="text-muted-foreground">Store net (gross)</dt>
                  <dd className="font-bold tabular">{rupees(s.grossNetPaise)}</dd>
                </div>
                <div className="rounded-lg bg-background px-2 py-1.5">
                  <dt className="text-muted-foreground">Commission</dt>
                  <dd className="font-bold tabular">{rupees(s.commissionPaise)}</dd>
                </div>
                <div className="rounded-lg bg-background px-2 py-1.5">
                  <dt className="text-muted-foreground">Voids (cancelled legs)</dt>
                  <dd className="font-bold tabular">{rupees(s.voidAdjustPaise)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-[10px] text-muted-foreground">
                ledger: {s.pendingRows} pending row{s.pendingRows === 1 ? '' : 's'} · {s.settledRows} settled
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* batches */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
          <Banknote className="h-3.5 w-3.5" aria-hidden /> Bank transfer log
        </h3>
        {data.batches.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No settlement batches yet — run one when you want to pay the stores.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {data.batches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-background px-3 py-2">
                <div>
                  <p className="text-xs font-bold">
                    {b.storeName} · {rupees(b.amountPaise)}{' '}
                    <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${b.status === 'PROCESSED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                      {b.status}
                    </span>
                  </p>
                  {b.utr && <p className="text-[10px] tabular text-muted-foreground">UTR {b.utr}</p>}
                  {b.detail && (
                    <p className="text-[10px] text-muted-foreground">
                      net {rupees(b.detail.netPayablePaise)} after voids {rupees(b.detail.voidAdjustPaise)} · commission {rupees(b.detail.commissionPaise)}
                    </p>
                  )}
                </div>
                {canAct && b.status === 'PENDING' && (
                  <button
                    onClick={() => processBatch(b.id, b.storeName)}
                    disabled={busy}
                    className="rounded-full bg-stone-900 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-stone-800 disabled:opacity-50"
                  >
                    Mark transferred
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {pendingBatches.length > 0 && canAct && (
          <p className="mt-2 text-[10px] text-muted-foreground">{pendingBatches.length} pending batch(es) awaiting the bank transfer.</p>
        )}
      </div>

      <p className="flex items-center gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
        <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" aria-hidden />
        Every amount is derived from the split ledger — adjustments (voided legs) are negative rows, so pending + settled − voids always reconciles to captured payments. No online refunds: the counter resolves exceptions in person.
      </p>
    </section>
  )
}
