// PATCH /api/admin/staff/[id] — manage one staff account (MALL_ADMIN only):
//   SET_PASSWORD — set a new login password (kicks the person out of all devices)
//   DEACTIVATE   — they quit / were let go: login blocked, sessions revoked
//   ACTIVATE     — re-enable a deactivated account
// The target account must belong to the caller's mall — checked by scope
// columns, never by what the client sends.

import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { hashPassword } from '@/lib/auth'
import { audit } from '@/lib/audit'

const bodySchema = z.object({
  action: z.enum(['SET_PASSWORD', 'DEACTIVATE', 'ACTIVATE']),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72)
    .regex(/[A-Za-z]/, 'Password needs at least one letter')
    .regex(/\d/, 'Password needs at least one number')
    .optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request, ['MALL_ADMIN'])
  if ('error' in auth) return auth.error
  const admin = auth.user
  if (!admin.mallId) return fail('Your admin account is not tied to a mall', 403)
  const { id } = await params

  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error
  const { action, password } = parsed.data

  const target = await db.user.findUnique({
    where: { id },
    include: { store: { select: { mallId: true, name: true } }, cinema: { select: { mallId: true, name: true } } },
  })
  if (!target || target.role === 'CUSTOMER') return fail('Staff account not found', 404)

  // scope guard: the account must live inside the caller's mall
  const inMall =
    target.mallId === admin.mallId || target.store?.mallId === admin.mallId || target.cinema?.mallId === admin.mallId
  if (!inMall) return fail('This account is not part of your mall', 403)

  if (action === 'SET_PASSWORD') {
    if (target.role === 'MALL_ADMIN' && target.id === admin.id) {
      return fail('Use a separate admin account to change your own password', 400)
    }
    if (!password) return fail('New password is required', 422)
    await db.$transaction([
      db.user.update({ where: { id: target.id }, data: { passwordHash: await hashPassword(password) } }),
      db.session.deleteMany({ where: { userId: target.id } }),
    ])
    await audit({
      actorRole: admin.role,
      actorRef: admin.email ?? admin.id,
      action: 'STAFF_PASSWORD_RESET',
      entityType: 'User',
      entityId: target.id,
      mallId: admin.mallId,
      meta: { email: target.email, storeName: target.store?.name ?? null },
    })
    return ok({ action, message: `Password updated for ${target.name} — all their devices were signed out` })
  }

  if (action === 'DEACTIVATE') {
    if (target.id === admin.id) return fail('You cannot deactivate your own account', 400)
    if (!target.isActive) return fail('This account is already deactivated', 409)
    await db.$transaction([
      db.user.update({ where: { id: target.id }, data: { isActive: false } }),
      db.session.deleteMany({ where: { userId: target.id } }),
    ])
    await audit({
      actorRole: admin.role,
      actorRef: admin.email ?? admin.id,
      action: 'STAFF_DEACTIVATED',
      entityType: 'User',
      entityId: target.id,
      mallId: admin.mallId,
      meta: { email: target.email, storeName: target.store?.name ?? null },
    })
    return ok({ action, message: `${target.name} can no longer sign in` })
  }

  // ACTIVATE
  if (target.isActive) return fail('This account is already active', 409)
  await db.user.update({ where: { id: target.id }, data: { isActive: true } })
  await audit({
    actorRole: admin.role,
    actorRef: admin.email ?? admin.id,
    action: 'STAFF_ACTIVATED',
    entityType: 'User',
    entityId: target.id,
    mallId: admin.mallId,
    meta: { email: target.email, storeName: target.store?.name ?? null },
  })
  return ok({ action, message: `${target.name} can sign in again` })
}
