// PATCH  /api/admin/staff/[id] — manage one staff account:
//   SET_PASSWORD — set a new login password (kicks the person out of all devices)
//   DEACTIVATE   — they quit / were let go: login blocked, sessions revoked
//   ACTIVATE     — re-enable a deactivated account
//   REASSIGN     — change role / store / block (e.g. promote a chef to store
//                  manager, or move them to another shop). Signs them out.
// DELETE /api/admin/staff/[id] — permanently remove a DEACTIVATED account from
//                  the team list (never a campus admin). Sessions cascade.
// Who may do what (pure matrix in src/lib/auth.ts → staffMutationError):
//   CAMPUS_ADMIN     — everything above for their whole campus (except on itself)
//   BLOCK_MANAGER — the delegated campus operator: same powers for the campus's
//                    workforce, but never on CAMPUS_ADMIN accounts
//   STORE_MANAGER  — SET_PASSWORD / DEACTIVATE / ACTIVATE on KITCHEN_STAFF of
//                    their OWN store only
// The target's membership is checked by scope columns, never client input.

import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { hashPassword, staffMutationError, type Role } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'

const ASSIGNABLE_ROLES = ['STORE_MANAGER', 'KITCHEN_STAFF', 'BLOCK_MANAGER'] as const

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
  blockId: z.string().trim().min(1).optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request, ['CAMPUS_ADMIN', 'BLOCK_MANAGER', 'STORE_MANAGER'])
  if ('error' in auth) return auth.error
  const admin = auth.user
  const { id } = await params

  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error
  const { action, password } = parsed.data

  const target = await db.user.findUnique({
    where: { id },
    include: { store: { select: { campusId: true, name: true } }, block: { select: { campusId: true, name: true } } },
  })
  if (!target || target.role === 'CUSTOMER') return fail('Staff account not found', 404)

  // scope guard: the account must live inside the caller's campus
  const inMall =
    (admin.campusId &&
      (target.campusId === admin.campusId || target.store?.campusId === admin.campusId || target.block?.campusId === admin.campusId)) ??
    false
  if (!inMall) return fail('This account is not part of your campus', 403)

  // RBAC matrix: who may run this action on this target (pure, unit-tested)
  const denial = staffMutationError(
    admin,
    { id: target.id, role: target.role as Role, campusId: target.campusId, storeId: target.storeId, blockId: target.blockId },
    action,
  )
  if (denial) return fail(denial, admin.id === target.id ? 400 : 403)
  // Audit rows want a campus anchor; a STORE_MANAGER has none on their own row —
  // resolve from the target's scope instead.
  const auditMallId = admin.campusId ?? target.store?.campusId ?? target.campusId

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
      campusId: auditMallId,
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
      campusId: auditMallId,
      meta: { email: target.email, storeName: target.store?.name ?? null },
    })
    return ok({ action, message: `${target.name} can no longer sign in` })
  }

  if (action === 'REASSIGN') {
    if (target.role === 'CAMPUS_ADMIN') {
      return fail('Campus admin accounts cannot be reassigned here', 400)
    }
    if (!parsed.data.role) return fail('Pick the new role', 422)
    const role = parsed.data.role

    let resolvedStoreId: string | null = null
    let resolvedCinemaId: string | null = null
    let scopeName: string | null = null

    if (role === 'BLOCK_MANAGER') {
      if (!parsed.data.blockId) return fail('Pick the block this person belongs to', 422)
      const block = await db.block.findUnique({ where: { id: parsed.data.blockId } })
      if (!block || block.campusId !== admin.campusId) return fail('That block is not in your campus', 400)
      resolvedCinemaId = block.id
      scopeName = block.name
    } else {
      if (!parsed.data.storeId) return fail('Pick the store this person belongs to', 422)
      const store = await db.store.findUnique({ where: { id: parsed.data.storeId } })
      if (!store || store.campusId !== admin.campusId) return fail('That store is not in your campus', 400)
      resolvedStoreId = store.id
      scopeName = store.name
    }

    const previous = target.store?.name ?? target.block?.name ?? 'campus'
    await db.$transaction([
      db.user.update({
        where: { id: target.id },
        data: { role, storeId: resolvedStoreId, blockId: resolvedCinemaId },
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
      campusId: auditMallId,
      meta: { email: target.email, previousRole: target.role, newRole: role, previousScope: previous, newScope: scopeName },
    })
    await emitToRooms({ rooms: [`admin:${admin.campusId}`], event: 'staff:update', data: { userId: target.id } })
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
    campusId: auditMallId,
    meta: { email: target.email, storeName: target.store?.name ?? null },
  })
  return ok({ action, message: `${target.name} can sign in again` })
}

// DELETE — permanently remove a deactivated staff account from the team list.
// Two-step by design: disable first, delete second, so a mis-tap can never
// vaporise an active login. Sessions cascade via the schema; audit rows keep
// string refs (no FK), so history survives the delete.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request, ['CAMPUS_ADMIN', 'BLOCK_MANAGER'])
  if ('error' in auth) return auth.error
  const admin = auth.user
  if (!admin.campusId) return fail('Your admin account is not tied to a campus', 403)
  const { id } = await params

  const target = await db.user.findUnique({
    where: { id },
    include: { store: { select: { campusId: true, name: true } }, block: { select: { campusId: true, name: true } } },
  })
  if (!target || target.role === 'CUSTOMER') return fail('Staff account not found', 404)

  const inMall =
    target.campusId === admin.campusId || target.store?.campusId === admin.campusId || target.block?.campusId === admin.campusId
  if (!inMall) return fail('This account is not part of your campus', 403)

  if (target.role === 'CAMPUS_ADMIN') return fail('Campus admin accounts cannot be removed here', 400)
  if (target.isActive) return fail('Disable the account first, then remove it', 409)

  await db.user.delete({ where: { id: target.id } })
  await audit({
    actorRole: admin.role,
    actorRef: admin.email ?? admin.id,
    action: 'STAFF_DELETED',
    entityType: 'User',
    entityId: target.id,
    campusId: admin.campusId,
    meta: { email: target.email, name: target.name, role: target.role, storeName: target.store?.name ?? null },
  })
  await emitToRooms({ rooms: [`admin:${admin.campusId}`], event: 'staff:update', data: { userId: target.id } })
  return ok({ message: `${target.name} was removed from the team` })
}
