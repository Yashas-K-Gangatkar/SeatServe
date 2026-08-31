// SeatServe Phase 3 — settlement engine (ledger-driven).
//
// The Split ledger is the single source of truth. STORE rows carry their own
// commission & tax (set at order creation; negative adjustment rows carry
// negatives), so per-store settlement needs NO re-derivation from menu prices:
//
//   grossNet    = Σ positive STORE rows              (what the store earned, net)
//   commission  = Σ commissionPaise on those rows    (platform keeps)
//   tax         = Σ taxPaise on those rows           (government, via platform)
//   adjustments = Σ negative STORE rows (VOIDED legs — no online refunds by policy)
//   netPayable  = grossNet + adjustments             (what the bank transfer is)
//
// Lifecycle:  POST runSettlementBatch() → Settlement rows (PENDING) snapshot the
// store's PENDING ledger  →  POST processSettlement() simulates the bank
// transfer (UTR) and flips the snapshot's rows to SETTLED (settlementId backlink).
// Invariant: a Split row belongs to at most ONE Settlement (settlementId unique
// per row), so double-payout is structurally impossible.

import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'

export interface StoreSettlementSummary {
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

/** Ledger-driven settlement summary for ONE store (all time, settlement-state aware). */
export async function storeSettlementSummary(storeId: string): Promise<StoreSettlementSummary | null> {
  const store = await db.store.findUnique({ where: { id: storeId } })
  if (!store) return null

  const rows = await db.split.findMany({
    where: { storeId, beneficiary: 'STORE' },
    select: { amountPaise: true, commissionPaise: true, taxPaise: true, settlementStatus: true },
  })

  let grossNetPaise = 0
  let commissionPaise = 0
  let taxPaise = 0
  let voidAdjustPaise = 0
  let pendingRows = 0
  let settledRows = 0

  for (const r of rows) {
    if (r.amountPaise >= 0) {
      grossNetPaise += r.amountPaise
      commissionPaise += r.commissionPaise
      taxPaise += r.taxPaise
      if (r.settlementStatus === 'PENDING') pendingRows += 1
      if (r.settlementStatus === 'SETTLED') settledRows += 1
    } else {
      voidAdjustPaise += r.amountPaise // negative
    }
  }

  return {
    storeId,
    storeName: store.name,
    storeSlug: store.slug,
    grossNetPaise,
    commissionPaise,
    taxPaise,
    voidAdjustPaise,
    netPayablePaise: grossNetPaise + voidAdjustPaise,
    pendingRows,
    settledRows,
  }
}

export interface SettlementBatchResult {
  batches: {
    settlementId: string
    storeId: string
    storeName: string
    amountPaise: number
    splitCount: number
    detail: {
      grossPaise: number
      commissionPaise: number
      taxPaise: number
      voidAdjustPaise: number
      netPayablePaise: number
    }
  }[]
  skipped: string[]
}

/**
 * Creates PENDING Settlement batches for the given stores (default: every
 * store in the mall with settleable rows). Each batch snapshots the store's
 * PENDING STORE rows + adjustment totals. Nothing is paid yet.
 */
export async function runSettlementBatch(mallId: string, storeIds?: string[]): Promise<SettlementBatchResult> {
  const stores = await db.store.findMany({
    where: { mallId, ...(storeIds && storeIds.length > 0 ? { id: { in: storeIds } } : {}) },
    orderBy: { name: 'asc' },
  })

  const batches: SettlementBatchResult['batches'] = []
  const skipped: string[] = []
  const now = new Date()

  for (const store of stores) {
    // PHASE 4 KYC PAYOUT GATE: money can only move to a VERIFIED merchant.
    // Unverified stores are skipped with an explicit reason — the ledger stays
    // untouched and they appear in the report, not in the payout.
    if (store.kycStatus !== 'VERIFIED') {
      skipped.push(`${store.name} (KYC ${store.kycStatus.toLowerCase()})`)
      continue
    }
    const pendingRows = await db.split.findMany({
      where: { storeId: store.id, beneficiary: 'STORE', settlementStatus: 'PENDING', settlementId: null },
      select: { id: true, amountPaise: true, commissionPaise: true, taxPaise: true },
    })
    // only POSITIVE rows are payable; negative rows stay PENDING-state forever
    const payable = pendingRows.filter((r) => r.amountPaise > 0)
    const negatives = pendingRows.filter((r) => r.amountPaise < 0)
    if (payable.length === 0 && negatives.length === 0) {
      skipped.push(store.name)
      continue
    }

    const grossPaise = payable.reduce((s, r) => s + r.amountPaise, 0)
    const commissionPaise = payable.reduce((s, r) => s + r.commissionPaise, 0)
    const taxPaise = payable.reduce((s, r) => s + r.taxPaise, 0)
    const voidAdjustPaise = negatives.reduce((s, r) => s + r.amountPaise, 0)

    const settlement = await db.settlement.create({
      data: {
        storeId: store.id,
        amountPaise: grossPaise,
        periodStart: now,
        periodEnd: now,
        status: 'PENDING',
        detail: JSON.stringify({
          grossPaise,
          commissionPaise,
          taxPaise,
          voidAdjustPaise,
          netPayablePaise: grossPaise + voidAdjustPaise,
          splitIds: payable.map((r) => r.id),
        }),
      },
    })

    // backlink the snapshot rows to this batch — unique-per-row so no double payout
    await db.split.updateMany({
      where: { id: { in: payable.map((r) => r.id) } },
      data: { settlementId: settlement.id },
    })

    batches.push({
      settlementId: settlement.id,
      storeId: store.id,
      storeName: store.name,
      amountPaise: grossPaise,
      splitCount: payable.length,
      detail: { grossPaise, commissionPaise, taxPaise, voidAdjustPaise, netPayablePaise: grossPaise + voidAdjustPaise },
    })
  }

  await audit({
    actorRole: 'MALL_ADMIN',
    action: 'SETTLEMENT_BATCH_CREATED',
    entityType: 'Settlement',
    entityId: batches.map((b) => b.settlementId).join(','),
    mallId,
    meta: { batches: batches.length, totalPaise: batches.reduce((s, b) => s + b.amountPaise, 0), skipped: skipped.length },
  })

  return { batches, skipped }
}

/** Simulates the bank transfer for one PENDING batch: UTR + rows → SETTLED. */
export async function processSettlement(settlementId: string): Promise<{ ok: true; utr: string; amountPaise: number } | { ok: false; status: number; error: string }> {
  const settlement = await db.settlement.findUnique({ where: { id: settlementId }, include: { store: true } })
  if (!settlement) return { ok: false, status: 404, error: 'Settlement batch not found' }
  if (settlement.status === 'PROCESSED') return { ok: false, status: 409, error: 'This batch was already processed' }
  if (settlement.status === 'FAILED') return { ok: false, status: 409, error: 'This batch failed — recreate it' }

  const utr = `UTR${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 46656).toString(36).toUpperCase().padStart(3, '0')}`

  const detail = settlement.detail ? (JSON.parse(settlement.detail) as { splitIds?: string[] }) : null
  const splitIds = detail?.splitIds ?? []

  await db.$transaction([
    db.settlement.update({
      where: { id: settlement.id },
      data: { status: 'PROCESSED', utr, processedAt: new Date() },
    }),
    // rows keep settlementStatus SETTLED; their money is now at the store's bank
    db.split.updateMany({
      where: { settlementId: settlement.id, settlementStatus: 'PENDING' },
      data: { settlementStatus: 'SETTLED' },
    }),
  ])
  void splitIds // snapshot retained in detail for the report

  await audit({
    actorRole: 'MALL_ADMIN',
    action: 'SETTLEMENT_PROCESSED',
    entityType: 'Settlement',
    entityId: settlement.id,
    mallId: settlement.store.mallId,
    meta: { storeName: settlement.store.name, amountPaise: settlement.amountPaise, utr },
  })

  await emitToRooms({
    rooms: [`admin:${settlement.store.mallId}`, `store:${settlement.storeId}`],
    event: 'settlement:update',
    data: { settlementId: settlement.id, storeName: settlement.store.name, status: 'PROCESSED', amountPaise: settlement.amountPaise },
  })

  return { ok: true, utr, amountPaise: settlement.amountPaise }
}
