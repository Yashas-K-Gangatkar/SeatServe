// POST /api/stores/[id]/kyc — Phase 4: merchant KYC submission (store onboarding).
//
// The STORE_MANAGER (or the mall admin on their behalf) submits compliance
// details. ONLY MASKED values are accepted and stored — the platform never
// holds raw bank/PAN credentials (legal review rule; see docs/LEGAL-NOTES.md).
// Submission (re)sets kycStatus to PENDING for mall-admin review; payouts via
// the settlement engine are BLOCKED until the mall admin VERIFIES the store.

import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { canAccessStore } from '@/lib/auth'
import { audit } from '@/lib/audit'

const bodySchema = z.object({
  gstin: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/, 'GSTIN must be a valid 15-character GSTIN').max(15),
  panMasked: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'PAN must be 10 characters (ABCDE1234F)'),
  bankMasked: z.string().min(4).max(4).regex(/^[0-9]{4}$/, 'Send ONLY the last 4 digits of the account number'),
  fssai: z.string().min(14).max(14).regex(/^[0-9]{14}$/, 'FSSAI license must be 14 digits'),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireStaff(request, ['STORE_MANAGER', 'MALL_ADMIN'])
  if ('error' in auth) return auth.error
  const user = auth.user

  const store = await db.store.findUnique({ where: { id } })
  if (!store) return fail('Store not found', 404)
  if (!canAccessStore(user, { id: store.id, mallId: store.mallId })) {
    return fail('Your account is not authorized for this store', 403)
  }

  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error
  const d = parsed.data

  // masked snapshot only — PAN/bank are masked server-side before storage
  const kycDetail = JSON.stringify({
    gstin: d.gstin,
    panMasked: `${d.panMasked.slice(0, 2)}•••••${d.panMasked.slice(-1)}`,
    bankMasked: `••••${d.bankMasked}`,
    fssai: d.fssai,
    submittedAt: new Date().toISOString(),
    submittedBy: user.email ?? user.id,
  })

  const updated = await db.store.update({
    where: { id },
    data: { kycStatus: 'PENDING', kycDetail, bankRefMasked: `••••${d.bankMasked}` },
  })

  await audit({
    actorRole: user.role,
    actorRef: user.email ?? user.id,
    action: 'KYC_SUBMITTED',
    entityType: 'Store',
    entityId: id,
    mallId: store.mallId,
    meta: { name: store.name, gstin: d.gstin, previousStatus: store.kycStatus },
  })

  return ok({ storeId: id, kycStatus: updated.kycStatus, kycDetail: JSON.parse(kycDetail) })
}
