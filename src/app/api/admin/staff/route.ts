// GET  /api/admin/staff — list staff accounts scoped to the caller:
//   MALL_ADMIN     → every account inside their mall (+ cinemas & delivery zones)
//   CINEMA_MANAGER → the delegated mall operator: same mall-wide list
//   STORE_MANAGER  → only their own store's accounts (their kitchen team)
// POST /api/admin/staff — create a staff account with an email + password the
// caller hands over in person:
//   MALL_ADMIN     → STORE_MANAGER / KITCHEN_STAFF / CINEMA_MANAGER / RUNNER
//   CINEMA_MANAGER → same mall-wide creation power (delegated onboarding),
//                    minus anything touching MALL_ADMIN accounts
//   STORE_MANAGER  → KITCHEN_STAFF pinned to their OWN store (nothing else)
//
// This is the onboarding screen for real staff: no Google/Gmail login exists
// anywhere in the platform — the "email" is a work login ID (it does not need
// to be a real mailbox and nothing is ever emailed to it), and the account is
// pinned to its store/cinema/runner scope server-side (cannot see another).

import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { hashPassword } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'

const bodySchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(60),
  email: z.string().trim().toLowerCase().email('Enter a valid login email'),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(/^\+?\d{10,13}$/, 'Enter a valid mobile number (10–13 digits)')),
  role: z.enum(['STORE_MANAGER', 'KITCHEN_STAFF', 'CINEMA_MANAGER', 'RUNNER']).optional(),
  storeId: z.string().trim().min(1).optional(),
  cinemaId: z.string().trim().min(1).optional(),
  zoneId: z.string().trim().min(1).optional(),
  password: z
    .string()
    .trim()
    .min(8, 'Password must be at least 8 characters')
    .max(72)
    .regex(/[A-Za-z]/, 'Password needs at least one letter')
    .regex(/\d/, 'Password needs at least one number')
    .optional(),
})

/** Staff rows that belong to the caller's mall, by any scope column. */
async function mallStaffWhere(mallId: string) {
  const [storeIds, cinemaIds] = await Promise.all([
    db.store.findMany({ where: { mallId }, select: { id: true } }),
    db.cinema.findMany({ where: { mallId }, select: { id: true } }),
  ])
  return {
    role: { not: 'CUSTOMER' },
    OR: [
      { mallId },
      { storeId: { in: storeIds.map((s) => s.id) } },
      { cinemaId: { in: cinemaIds.map((c) => c.id) } },
    ],
  }
}

const STAFF_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  store: { select: { id: true, name: true } },
  cinema: { select: { id: true, name: true } },
} as const

export async function GET(request: Request) {
  const auth = await requireStaff(request, ['MALL_ADMIN', 'CINEMA_MANAGER', 'STORE_MANAGER'])
  if ('error' in auth) return auth.error
  const user = auth.user

  if (user.role === 'STORE_MANAGER') {
    // Manager view: their own store's team only (server-pinned scope).
    const users = await db.user.findMany({
      where: { role: { not: 'CUSTOMER' }, storeId: user.storeId ?? '__none__' },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: STAFF_SELECT,
    })
    return ok({
      staff: users.map(toRow),
      cinemas: [],
      zones: [],
    })
  }

  if (!user.mallId) return fail('Your admin account is not tied to a mall', 403)

  const where = await mallStaffWhere(user.mallId)
  const [users, cinemas, zones] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: STAFF_SELECT,
    }),
    db.cinema.findMany({ where: { mallId: user.mallId }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true } }),
    db.deliveryZone.findMany({ where: { mallId: user.mallId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ])

  return ok({ staff: users.map(toRow), cinemas, zones })
}

function toRow(u: {
  id: string
  name: string
  email: string | null
  phone: string
  role: string
  isActive: boolean
  store: { id: string; name: string } | null
  cinema: { id: string; name: string } | null
}) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    isActive: u.isActive,
    storeId: u.store?.id ?? null,
    storeName: u.store?.name ?? null,
    cinemaId: u.cinema?.id ?? null,
    cinemaName: u.cinema?.name ?? null,
  }
}

export async function POST(request: Request) {
  const auth = await requireStaff(request, ['MALL_ADMIN', 'CINEMA_MANAGER', 'STORE_MANAGER'])
  if ('error' in auth) return auth.error
  const caller = auth.user

  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error
  const { name, email, phone, password } = parsed.data

  // ── resolve role + scope from the CALLER's role, never from client trust ──
  let role: 'STORE_MANAGER' | 'KITCHEN_STAFF' | 'CINEMA_MANAGER' | 'RUNNER'
  let resolvedStoreId: string | null = null
  let resolvedCinemaId: string | null = null
  let resolvedRunnerId: string | null = null
  let mallId: string
  let scopeName: string | null

  if (caller.role === 'STORE_MANAGER') {
    // Store managers grow their own floor team — kitchen staff for THEIR store,
    // nothing wider. Any other requested role is refused outright.
    if (parsed.data.role && parsed.data.role !== 'KITCHEN_STAFF') {
      return fail('Store managers can only add kitchen staff accounts', 403)
    }
    role = 'KITCHEN_STAFF'
    const store = await db.store.findUnique({ where: { id: caller.storeId ?? '' } })
    if (!store) return fail('Your account is not tied to a store', 403)
    mallId = store.mallId
    resolvedStoreId = store.id
    scopeName = store.name
  } else {
    if (!caller.mallId) return fail('Your admin account is not tied to a mall', 403)
    mallId = caller.mallId
    const requestedRole = parsed.data.role
    if (!requestedRole) return fail('Pick a role for the new account', 422)
    role = requestedRole

    if (role === 'CINEMA_MANAGER') {
      if (!parsed.data.cinemaId) return fail('Pick the cinema this person belongs to', 422)
      const cinema = await db.cinema.findUnique({ where: { id: parsed.data.cinemaId } })
      if (!cinema || cinema.mallId !== mallId) return fail('That cinema is not in your mall', 400)
      resolvedCinemaId = cinema.id
      scopeName = cinema.name
    } else if (role === 'RUNNER') {
      // Delivery runner: a login + a Runner roster row. A zone is REQUIRED —
      // both auto-assign and manual assignment match runners by zone→mall.
      if (!parsed.data.zoneId) return fail('Pick the delivery zone this runner works in', 422)
      const zone = await db.deliveryZone.findUnique({ where: { id: parsed.data.zoneId } })
      if (!zone || zone.mallId !== mallId) return fail('That zone is not in your mall', 400)
      scopeName = zone.name
    } else {
      if (!parsed.data.storeId) return fail('Pick the store this person belongs to', 422)
      const store = await db.store.findUnique({ where: { id: parsed.data.storeId } })
      if (!store || store.mallId !== mallId) return fail('That store is not in your mall', 400)
      resolvedStoreId = store.id
      scopeName = store.name
    }
  }

  // friendly uniqueness errors (schema enforces the same, but 409 reads better)
  const clash = await db.user.findFirst({
    where: { OR: [{ email }, { phone }] },
    select: { email: true, phone: true },
  })
  if (clash) {
    if (clash.email === email) return fail(`The login email ${email} is already in use`, 409)
    return fail('That mobile number is already registered', 409)
  }

  const passwordHash = await hashPassword(password ?? generateFallbackPassword())

  // Runner logins need a Runner roster row (the delivery engine pins runs to
  // it) — created atomically with the user so no orphan rows can exist.
  const created = await db.$transaction(async (tx) => {
    if (role === 'RUNNER') {
      const runner = await tx.runner.create({
        data: { name, phone, zoneId: parsed.data.zoneId ?? null, isOnDuty: true },
      })
      resolvedRunnerId = runner.id
    }
    return tx.user.create({
      data: {
        name,
        email,
        phone,
        role,
        mallId,
        storeId: resolvedStoreId,
        cinemaId: resolvedCinemaId,
        runnerId: resolvedRunnerId,
        passwordHash,
        isActive: true,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    })
  })

  await audit({
    actorRole: caller.role,
    actorRef: caller.email ?? caller.id,
    action: 'STAFF_CREATED',
    entityType: 'User',
    entityId: created.id,
    mallId,
    meta: { name, email, role, storeName: role === 'RUNNER' ? null : scopeName, zoneName: role === 'RUNNER' ? scopeName : null },
  })

  await emitToRooms({ rooms: [`admin:${mallId}`], event: 'staff:update', data: { userId: created.id } })

  return ok(
    {
      staff: created,
      scope: scopeName,
      loginUrl: '/staff/login',
      note: 'Share the email + password in person or on a call. The staff member signs in at the staff portal and only sees their own scope.',
    },
    201,
  )
}

/** Only used when a caller omits the password (should not happen from the UI). */
function generateFallbackPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 12; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return `${out}7a`
}
