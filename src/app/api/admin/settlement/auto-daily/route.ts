// GET /api/admin/settlement/auto-daily — Vercel Cron endpoint (23:00 IST daily).
//
// "Close the day": prepares PENDING settlement batches for ALL stores of the
// mall in one shot — exactly what the admin's "Run settlement batch" button
// does, triggered automatically every night. Idempotent by construction: the
// ledger engine only ever batches rows that have no settlementId yet, so a
// manual batch earlier the same day simply leaves nothing new for the cron.
//
// The cron PREPARES payouts, it never MOVES money — the bank transfer + real
// UTR stay a deliberate human action ("Mark transferred").
//
// Auth: requires `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends it
// when the env var is set). Unset secret = endpoint disabled. `?dry=1` reports
// what WOULD be batched without creating anything (safe verification).

import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'
import { runSettlementBatch } from '@/lib/settlement'
import { cronSecretMatches } from '@/lib/cron-auth'

export async function GET(request: Request) {
  if (!cronSecretMatches(process.env.CRON_SECRET, request.headers.get('authorization'))) {
    return fail('Unauthorized', 401)
  }

  const mall = await db.mall.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!mall) return fail('No mall configured', 404)

  const dry = new URL(request.url).searchParams.get('dry') === '1'

  if (dry) {
    // Mirror runSettlementBatch's exact eligibility logic, without writing.
    const stores = await db.store.findMany({ where: { mallId: mall.id }, orderBy: { name: 'asc' } })
    const wouldSettle: { storeName: string; netPayablePaise: number; orderRows: number }[] = []
    const skipped: string[] = []
    for (const store of stores) {
      if (store.kycStatus !== 'VERIFIED') {
        skipped.push(`${store.name} (KYC ${store.kycStatus.toLowerCase()})`)
        continue
      }
      const pendingRows = await db.split.findMany({
        where: { storeId: store.id, beneficiary: 'STORE', settlementStatus: 'PENDING', settlementId: null },
        select: { amountPaise: true },
      })
      const payable = pendingRows.filter((r) => r.amountPaise > 0)
      const negatives = pendingRows.filter((r) => r.amountPaise < 0)
      if (payable.length === 0 && negatives.length === 0) {
        skipped.push(store.name)
        continue
      }
      const netPayablePaise = pendingRows.reduce((s, r) => s + r.amountPaise, 0)
      wouldSettle.push({ storeName: store.name, netPayablePaise, orderRows: payable.length })
    }
    return ok({ dry: true, mall: mall.name, wouldSettle, skipped })
  }

  const result = await runSettlementBatch(mall.id)
  return ok({
    dry: false,
    mall: mall.name,
    batches: result.batches,
    skipped: result.skipped,
  })
}
