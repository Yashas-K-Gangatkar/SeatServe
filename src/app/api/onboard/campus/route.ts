// POST /api/onboard/campus — SELF-SERVE university onboarding ("how does a
// college get into NotiFetch?"). One call stands the whole campus up:
//   Campus → Block → N classrooms (each with a DOOR QR token + seats) →
//   canteen store (KYC PENDING — money unlocks only after admin verification)
//   → BLOCK_MANAGER login → delivery zone + runner.
// Public but heavily bounded (rate limit + hard caps) so it can never be
// abused into a database-pumping toy: every venue lands in the audit trail
// and KYC still gates real money.
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { hashPassword } from '@/lib/auth'
import { generateQrToken } from '@/lib/ids'
import { audit } from '@/lib/audit'

const MAX_CLASSES = 40
const MAX_SEATS_PER_ROOM = 100
const ROWS_MAX = 10
const COLS_MAX = 10

const bodySchema = z.object({
  campusName: z.string().trim().min(3).max(80),
  city: z.string().trim().min(2).max(40),
  blockName: z.string().trim().min(2).max(40),
  classrooms: z.number().int().min(1).max(MAX_CLASSES),
  seatRows: z.number().int().min(1).max(ROWS_MAX).default(6),
  seatCols: z.number().int().min(1).max(COLS_MAX).default(6),
  storeName: z.string().trim().min(2).max(40),
  adminName: z.string().trim().min(2).max(60),
  // staff portal login is email + password
  adminEmail: z.string().trim().toLowerCase().email('Enter a valid email'),
  // phone kept on the account for runner coordination
  adminPhone: z.string().trim().regex(/^\d{10}$/, 'Phone must be a 10-digit Indian mobile number'),
  password: z.string().min(8).max(72),
})

// ── tiny in-memory rate limit (per isolate — good enough for a free wizard) ──
const hits = new Map<string, { n: number; resetAt: number }>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const rec = hits.get(ip)
  if (!rec || rec.resetAt < now) {
    hits.set(ip, { n: 1, resetAt: now + 3600_000 })
    return false
  }
  rec.n++
  return rec.n > 5
}

const ROW_LETTERS = 'ABCDEFGHJKLMNP'

export async function POST(request: Request) {
  const ip = (request.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim()
  if (rateLimited(ip)) return fail('Too many campus signups from this network — try again in an hour.', 429)

  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error
  const d = parsed.data
  if (d.seatRows * d.seatCols > MAX_SEATS_PER_ROOM) {
    return fail(`Max ${MAX_SEATS_PER_ROOM} seats per classroom.`, 422)
  }

  // phone AND email must be free — email becomes the manager's login
  const [byEmail, byPhone] = await Promise.all([
    db.user.findUnique({ where: { email: d.adminEmail }, select: { id: true } }),
    db.user.findUnique({ where: { phone: d.adminPhone }, select: { id: true } }),
  ])
  if (byEmail || byPhone) {
    return fail('That email or phone already has a staff account. Use different details.', 409)
  }

  const campus = await db.campus.create({
    data: {
      name: d.campusName,
      city: d.city,
      address: `${d.blockName}, ${d.city}`,
      blocks: {
        create: {
          name: d.blockName,
          classrooms: {
            create: Array.from({ length: d.classrooms }, (_, i) => {
              const num = i + 1
              return {
                name: `Room ${d.blockName.slice(0, 1).toUpperCase()}-${100 + num}`,
                seatRows: d.seatRows,
                seatCols: d.seatCols,
                doorQrToken: generateQrToken(),
                seats: {
                  create: Array.from({ length: d.seatRows }, (_, r) =>
                    Array.from({ length: d.seatCols }, (_, c) => ({
                      code: `${ROW_LETTERS[r]}-${c + 1}`,
                      rowLabel: ROW_LETTERS[r],
                      seatNumber: c + 1,
                      qrToken: generateQrToken(),
                    })),
                  ).flat(),
                },
              }
            }),
          },
        },
      },
      stores: {
        create: {
          name: d.storeName,
          slug: `${d.campusName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${d.storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
          isOpen: true,
          kycStatus: 'PENDING',
        },
      },
      zones: { create: { name: 'Main campus', description: 'All blocks — walking distance' } },
      users: {
        create: {
          name: d.adminName,
          email: d.adminEmail,
          phone: d.adminPhone,
          role: 'BLOCK_MANAGER',
          passwordHash: await hashPassword(d.password),
        },
      },
    },
    include: {
      blocks: { include: { classrooms: { orderBy: { name: 'asc' } } } },
      stores: { select: { id: true, name: true } },
      zones: { select: { id: true } },
      users: { select: { id: true } },
    },
  })

  const block = campus.blocks[0]
  const store = campus.stores[0]
  const manager = campus.users[0]

  // Every classroom starts with a ROLLING 'Break' lecture starting ~40 min
  // out (30-min cutoff → ordering open). demoAutoRoll=true keeps rolling it
  // forward, so a freshly onboarded campus is orderable from minute one and
  // stays that way until the college enters its real timetable.
  await db.lecture.createMany({
    data: block.classrooms.map((c) => ({
      classroomId: c.id,
      subject: 'Break',
      startsAt: new Date(Date.now() + 40 * 60_000),
      orderCutoffMinutes: 30,
      isActive: true,
      demoAutoRoll: true,
    })),
  })

  // wire the scopes that need child ids + a default campus runner
  await Promise.all([
    db.user.update({ where: { id: manager.id }, data: { campusId: campus.id, blockId: block.id } }),
    db.runner.create({
      data: { name: `${d.campusName} runner`, phone: `9${Date.now().toString().slice(-9)}`, zoneId: campus.zones[0].id },
    }),
  ])

  await audit({
    actorRole: 'SYSTEM',
    action: 'CAMPUS_ONBOARDED',
    entityType: 'Campus',
    entityId: campus.id,
    campusId: campus.id,
    meta: { campus: d.campusName, block: d.blockName, classrooms: d.classrooms, store: d.storeName },
  })

  return ok(
    {
      campusId: campus.id,
      campusName: campus.name,
      blockId: block.id,
      blockName: block.name,
      storeId: store.id,
      manager: { login: d.adminEmail, name: d.adminName, role: 'BLOCK_MANAGER' },
      classrooms: block.classrooms.map((c) => ({
        id: c.id,
        name: c.name,
        doorQrToken: c.doorQrToken,
        seats: c.seatRows * c.seatCols,
      })),
      orderUrl: `https://notifetch.in/?qr=${block.classrooms[0]?.doorQrToken ?? ''}`,
    },
    201,
  )
}
