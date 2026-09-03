// PATCH  /api/admin/staff/[id] — manage one staff account:
//   SET_PASSWORD — set a new login password (kicks the person out of all devices)
//   DEACTIVATE   — they quit / were let go: login blocked, sessions revoked
//   ACTIVATE     — re-enable a deactivated account
//   REASSIGN     — change role / store / cinema (e.g. promote a chef to store
//                  manager, or move them to another shop). Signs them out.
// DELETE /api/admin/staff/[id] — permanently remove a DEACTIVATED account from
//                  the team list (never a mall admin). Sessions cascade.
// Who may do what (pure matrix in src/lib/auth.ts → staffMutationError):
//   MALL_ADMIN    — everything above for their whole mall (except on itself)
//   STORE_MANAGER — SET_PASSWORD / DEACTIVATE / ACTIVATE on KITCHEN_STAFF of
//                   their OWN store only
// The target's membership is checked by scope columns, never client input.

import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { hashPassword, staffMutationError, type Role } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'

const ASSIGNABLE_ROLES = ['STORE_MANAGER', 'KITCHEN_STAFF', 'CINEMA_MANAGER'] as const

const bodySchema = z.object({
  action: z.enum(['SET_PASSWORD', 'DEACTIVATE', 'ACTIVATE', 'REASSIGN']),
  password: z
    .string()
    .trim()
    .min(8, 'Password must be at least 8 characters')
    .max(72)
    .regex(/[A-Za-z]/, 'Password needs at least one letter')
    .regex(/\d/, 'Password needs at least one number')
    .optional(),
  role: z.enum(ASSIGNABLE_ROLES).optional(),
  storeId: z.string().trim().min(1).optional(),
  cinemaId: z.string().trim().min(1).optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request, ['MALL_ADMIN', 'STORE_MANAGER'])
  if ('error' in auth) return auth.error
  const admin = auth.user
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
    (admin.mallId &&
      (target.mallId === admin.mallId || target.store?.mallId === admin.mallId || target.cinema?.mallId === admin.mallId)) ??
    false
  if (!inMall) return fail('This account is not part of your mall', 403)

  // RBAC matrix: who may run this action on this target (pure, unit-tested)
  const denial = staffMutationError(
    admin,
    { id: target.id, role: target.role as Role, mallId: target.mallId, storeId: target.storeId, cinemaId: target.cinemaId },
    action,
  )
  if (denial) return fail(denial, admin.id === target.id ? 400 : 403)
  // Audit rows want a mall anchor; a STORE_MANAGER has none on their own row —
  // resolve from the target's scope instead.
  const auditMallId = admin.mallId ?? target.store?.mallId ?? target.mallId

  if (action === 'SET_PASSWORD') {
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
      mallId: auditMallId,
      meta: { email: target.email, storeName: target.store?.name ?? null },
    })
    return ok({ action, message: `Password updated for ${target.name} — all their devices were signed out` })
  }

  if (action === 'DEACTIVATE') {
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
      mallId: auditMallId,
      meta: { email: target.email, storeName: target.store?.name ?? null },
    })
    return ok({ action, message: `${target.name} can no longer sign in` })
  }

  if (action === 'REASSIGN') {
    if (target.role === 'MALL_ADMIN') {
      return fail('Mall admin accounts cannot be reassigned here', 400)
    }
    if (!parsed.data.role) return fail('Pick the new role', 422)
    const role = parsed.data.role

    let resolvedStoreId: string | null = null
    let resolvedCinemaId: string | null = null
    let scopeName: string | null = null

    if (role === 'CINEMA_MANAGER') {
      if (!parsed.data.cinemaId) return fail('Pick the cinema this person belongs to', 422)
      const cinema = await db.cinema.findUnique({ where: { id: parsed.data.cinemaId } })
      if (!cinema || cinema.mallId !== admin.mallId) return fail('That cinema is not in your mall', 400)
      resolvedCinemaId = cinema.id
      scopeName = cinema.name
    } else {
      if (!parsed.data.storeId) return fail('Pick the store this person belongs to', 422)
      const store = await db.store.findUnique({ where: { id: parsed.data.storeId } })
      if (!store || store.mallId !== admin.mallId) return fail('That store is not in your mall', 400)
      resolvedStoreId = store.id
      scopeName = store.name
    }

    const previous = target.store?.name ?? target.cinema?.name ?? 'mall'
    await db.$transaction([
      db.user.update({
        where: { id: target.id },
        data: { role, storeId: resolvedStoreId, cinemaId: resolvedCinemaId },
      }),
      // role changes move the security boundary — sign them out everywhere
      db.session.deleteMany({ where: { userId: target.id } }),
    ])
    await audit({
      actorRole: admin.role,
      actorRef: admin.email ?? admin.id,
      action: 'STAFF_REASSIGNED',
      entityType: 'User',
      entityId: target.id,
      mallId: auditMallId,
      meta: { email: target.email, previousRole: target.role, newRole: role, previousScope: previous, newScope: scopeName },
    })
    await emitToRooms({ rooms: [`admin:${admin.mallId}`], event: 'staff:update', data: { userId: target.id } })
    return ok({ action, message: `${target.name} is now ${role.replace('_', ' ').toLowerCase()} at ${scopeName} — signed out of all devices` })
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
    mallId: auditMallId,
    meta: { email: target.email, storeName: target.store?.name ?? null },
  })
  return ok({ action, message: `${target.name} can sign in again` })
}

// DELETE — permanently remove a deactivated staff account from the team list.
// Two-step by design: disable first, delete second, so a mis-tap can never
// vaporise an active login. Sessions cascade via the schema; audit rows keep
// string refs (no FK), so history survives the delete.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request, ['MALL_ADMIN'])
  if ('error' in auth) return auth.error
  const admin = auth.user
  if (!admin.mallId) return fail('Your admin account is not tied to a mall', 403)
  const { id } = await params

  const target = await db.user.findUnique({
    where: { id },
    include: { store: { select: { mallId: true, name: true } }, cinema: { select: { mallId: true, name: true } } },
  })
  if (!target || target.role === 'CUSTOMER') return fail('Staff account not found', 404)

  const inMall =
    target.mallId === admin.mallId || target.store?.mallId === admin.mallId || target.cinema?.mallId === admin.mallId
  if (!inMall) return fail('This account is not part of your mall', 403)

  if (target.role === 'MALL_ADMIN') return fail('Mall admin accounts cannot be removed here', 400)
  if (target.isActive) return fail('Disable the account first, then remove it', 409)

  await db.user.delete({ where: { id: target.id } })
  await audit({
    actorRole: admin.role,
    actorRef: admin.email ?? admin.id,
    action: 'STAFF_DELETED',
    entityType: 'User',
    entityId: target.id,
    mallId: admin.mallId,
    meta: { email: target.email, name: target.name, role: target.role, storeName: target.store?.name ?? null },
  })
  await emitToRooms({ rooms: [`admin:${admin.mallId}`], event: 'staff:update', data: { userId: target.id } })
  return ok({ message: `${target.name} was removed from the team` })
}
