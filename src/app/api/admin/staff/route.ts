// GET  /api/admin/staff — list the staff accounts scoped to the caller's mall
// POST /api/admin/staff — MALL_ADMIN creates a staff account (chef / store
// manager / cinema manager) with an email + password they hand over in person.
//
// This is the onboarding screen for real staff: no Google/Gmail login exists
// anywhere in the platform — the "email" is a work login ID (it does not need
// to be a real mailbox and nothing is ever emailed to it), and the account is
// pinned to its store/cinema scope server-side (cannot see other stores).
//
// Role boundaries:
//   MALL_ADMIN     — full staff management for their own mall
//   any other role — 403

import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { requireStaff } from '@/lib/auth-server'
import { hashPassword } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'

const ASSIGNABLE_ROLES = ['STORE_MANAGER', 'KITCHEN_STAFF', 'CINEMA_MANAGER'] as const

const bodySchema = z
  .object({
    name: z.string().trim().min(2, 'Name is too short').max(60),
    email: z.string().trim().toLowerCase().email('Enter a valid login email'),
    phone: z
      .string()
      .trim()
      .transform((v) => v.replace(/[\s-]/g, ''))
      .pipe(z.string().regex(/^\+?\d{10,13}$/, 'Enter a valid mobile number (10–13 digits)')),
    role: z.enum(ASSIGNABLE_ROLES),
    storeId: z.string().trim().min(1).optional(),
    cinemaId: z.string().trim().min(1).optional(),
    password: z
      .string()
      .trim()
      .min(8, 'Password must be at least 8 characters')
      .max(72)
      .regex(/[A-Za-z]/, 'Password needs at least one letter')
      .regex(/\d/, 'Password needs at least one number')
      .optional(),
  })
  .refine((v) => (v.role === 'CINEMA_MANAGER' ? !!v.cinemaId : !!v.storeId), {
    message: 'Pick the store (or cinema) this person belongs to',
    path: ['storeId'],
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

export async function GET(request: Request) {
  const auth = await requireStaff(request, ['MALL_ADMIN'])
  if ('error' in auth) return auth.error
  if (!auth.user.mallId) return fail('Your admin account is not tied to a mall', 403)

  const where = await mallStaffWhere(auth.user.mallId)
  const [users, cinemas] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        store: { select: { id: true, name: true } },
        cinema: { select: { id: true, name: true } },
      },
    }),
    db.cinema.findMany({ where: { mallId: auth.user.mallId }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true } }),
  ])

  return ok({
    staff: users.map((u) => ({
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
    })),
    cinemas,
  })
}

export async function POST(request: Request) {
  const auth = await requireStaff(request, ['MALL_ADMIN'])
  if ('error' in auth) return auth.error
  const admin = auth.user
  if (!admin.mallId) return fail('Your admin account is not tied to a mall', 403)

  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error
  const { name, email, phone, role, storeId, cinemaId, password } = parsed.data

  // scope check: the target store/cinema must belong to the caller's mall
  let resolvedStoreId: string | null = null
  let resolvedCinemaId: string | null = null
  let storeName: string | null = null
  let cinemaName: string | null = null

  if (role === 'CINEMA_MANAGER') {
    const cinema = await db.cinema.findUnique({ where: { id: cinemaId! } })
    if (!cinema || cinema.mallId !== admin.mallId) return fail('That cinema is not in your mall', 400)
    resolvedCinemaId = cinema.id
    cinemaName = cinema.name
  } else {
    const store = await db.store.findUnique({ where: { id: storeId! } })
    if (!store || store.mallId !== admin.mallId) return fail('That store is not in your mall', 400)
    resolvedStoreId = store.id
    storeName = store.name
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

  const created = await db.user.create({
    data: {
      name,
      email,
      phone,
      role,
      mallId: admin.mallId,
      storeId: resolvedStoreId,
      cinemaId: resolvedCinemaId,
      passwordHash: await hashPassword(password ?? generateFallbackPassword()),
      isActive: true,
    },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  })

  await audit({
    actorRole: admin.role,
    actorRef: admin.email ?? admin.id,
    action: 'STAFF_CREATED',
    entityType: 'User',
    entityId: created.id,
    mallId: admin.mallId,
    meta: { name, email, role, storeName, cinemaName },
  })

  await emitToRooms({ rooms: [`admin:${admin.mallId}`], event: 'staff:update', data: { userId: created.id } })

  return ok(
    {
      staff: created,
      scope: storeName ?? cinemaName,
      loginUrl: '/staff/login',
      note: 'Share the email + password in person or on a call. The staff member signs in at the staff portal and only sees their own store.',
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
