// GET /api/cron/sheet-sync — owner's Google Sheet → staff accounts, hands-free.
//
// The owner edits a published Google Sheet ("Staff roster": name, email, role,
// store, password, active…). A cron trigger hits this route every few minutes;
// the server fetches the sheet as CSV and applies it to the staff User table:
//   new email        → account created (role + scope resolved by name match)
//   changed fields   → account updated (name/role/scope/phone/password/active)
//   active = FALSE   → account deactivated (never deleted — history survives)
// Fully autonomous: no AI, no human clicks — the schedule is the only driver.
// Dormant by design until SHEET_SYNC_URL is set (never accidentally open).
//
// Auth: requires `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends it
// automatically; external pingers like cron-job.org must set the header).
// `?dry=1` reports what WOULD change without writing anything (safe check).
//
// Security posture: every applied change is audited (STAFF_CREATED / UPDATED /
// DEACTIVATED with actorRef 'sheet-sync'); passwords are validated, hashed and
// never logged, returned, or stored in audit meta; emails are matched exactly
// (lowercase); unknown roles/scopes skip the row with a reason instead of
// guessing; the sheet can never delete a row or escalate past the role list.

import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'
import { cronSecretMatches } from '@/lib/cron-auth'
import { hashPassword } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { mapSheet, pseudoPhoneFor, type SheetRecord } from '@/lib/sheet-sync'

const MAX_ROWS = 500

function fallbackPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  const bytes = randomBytes(12)
  for (let i = 0; i < 12; i += 1) out += alphabet[bytes[i] % alphabet.length]
  return `${out}7a`
}

type NamedRef = { id: string; name: string; campusId: string }
type NameMaps = {
  storeByName: Map<string, NamedRef>
  blockByName: Map<string, NamedRef>
  zoneByName: Map<string, NamedRef>
}

type ExistingUser = {
  id: string
  email: string | null
  name: string
  role: string
  isActive: boolean
  storeId: string | null
  blockId: string | null
  runnerId: string | null
  phone: string
}

type ParsedRow = ReturnType<typeof mapSheet>['rows'][number]

export async function GET(request: Request) {
  if (!cronSecretMatches(process.env.CRON_SECRET, request.headers.get('authorization'))) {
    return fail('Unauthorized', 401)
  }

  const sheetUrl = process.env.SHEET_SYNC_URL?.trim()
  if (!sheetUrl) {
    return ok({
      enabled: false,
      note: 'Set SHEET_SYNC_URL (published Google-Sheet CSV link) to activate sheet-sync.',
    })
  }

  const dry = new URL(request.url).searchParams.get('dry') === '1'

  // 1. fetch the published CSV
  let csv: string
  try {
    const res = await fetch(sheetUrl, { cache: 'no-store', signal: AbortSignal.timeout(15_000), redirect: 'follow' })
    if (!res.ok) return fail(`Sheet fetch failed: HTTP ${res.status}`, 502)
    csv = await res.text()
  } catch (err) {
    return fail(`Sheet fetch failed: ${err instanceof Error ? err.message : 'network error'}`, 502)
  }

  // 2. parse + validate
  const { headerFound, rows, total } = mapSheet(csv)
  if (!headerFound) {
    return fail('Sheet header row not recognized — needs at least: name, email, role columns', 422)
  }
  if (total > MAX_ROWS) return fail(`Sheet has ${total} rows — limit is ${MAX_ROWS}`, 422)

  const good = rows.filter((r): r is Extract<ParsedRow, { ok: true }> => r.ok)
  const skipped = rows
    .filter((r): r is Extract<ParsedRow, { ok: false }> => !r.ok)
    .map((r) => ({ email: r.email, row: r.rowNumber, reason: r.reason }))

  // 3. load lookup data + existing staff
  const campus = await db.campus.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!campus) return fail('No campus configured', 404)

  const [stores, blocks, zones, existing] = await Promise.all([
    db.store.findMany({ select: { id: true, name: true, campusId: true } }),
    db.block.findMany({ select: { id: true, name: true, campusId: true } }),
    db.deliveryZone.findMany({ select: { id: true, name: true, campusId: true } }),
    db.user.findMany({
      where: { role: { not: 'CUSTOMER' } },
      select: { id: true, email: true, name: true, role: true, isActive: true, storeId: true, blockId: true, runnerId: true, phone: true },
    }),
  ])

  const maps: NameMaps = {
    storeByName: new Map(stores.map((s) => [s.name.trim().toLowerCase(), s])),
    blockByName: new Map(blocks.map((b) => [b.name.trim().toLowerCase(), b])),
    zoneByName: new Map(zones.map((z) => [z.name.trim().toLowerCase(), z])),
  }
  const byEmail = new Map(existing.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u])) as Map<string, ExistingUser>

  const created: string[] = []
  const updated: string[] = []
  const deactivated: string[] = []
  const unchanged: string[] = []

  // 4. apply row by row — one bad row never blocks the rest
  for (const { record } of good) {
    const prior = byEmail.get(record.email)
    try {
      if (!prior) {
        if (dry) {
          created.push(record.email)
          continue
        }
        await applyCreate(record, campus.id, maps)
        created.push(record.email)
        continue
      }
      if (dry) {
        const diff = diffFor(record, prior)
        if (diff.length === 0) unchanged.push(record.email)
        else if (diff.length === 1 && diff[0] === 'active=false') deactivated.push(record.email)
        else updated.push(record.email)
        continue
      }
      const result = await applyUpdate(record, prior)
      if (result === 'unchanged') unchanged.push(record.email)
      else if (result === 'deactivated') deactivated.push(record.email)
      else updated.push(record.email)
    } catch (err) {
      const reason =
        err instanceof Object && 'code' in err && (err as { code?: string }).code === 'P2002'
          ? 'unique clash (email/phone already registered)'
          : err instanceof Error
            ? err.message
            : 'database error'
      skipped.push({ email: record.email, row: record.rowNumber, reason })
    }
  }

  if (dry) {
    return ok({
      enabled: true,
      dry: true,
      campus: campus.name,
      rows: total,
      wouldCreate: created,
      wouldUpdate: updated,
      wouldDeactivate: deactivated,
      unchanged,
      skipped,
    })
  }

  return ok({
    enabled: true,
    dry: false,
    campus: campus.name,
    rows: total,
    created,
    updated,
    deactivated,
    unchanged,
    skipped,
  })

  // ── helpers ──────────────────────────────────────────────────────

  function diffFor(rec: SheetRecord, prior: { name: string; role: string; isActive: boolean; phone: string }): string[] {
    const diffs: string[] = []
    if (rec.name !== prior.name) diffs.push('name')
    if (rec.role !== prior.role) diffs.push('role')
    if (rec.phone && rec.phone !== prior.phone) diffs.push('phone')
    if (rec.active !== null && rec.active !== prior.isActive) diffs.push(rec.active ? 'active=true' : 'active=false')
    if (rec.password) diffs.push('password')
    return diffs
  }

  async function applyCreate(rec: SheetRecord, campusId: string, m: NameMaps) {
    let storeId: string | null = null
    let blockId: string | null = null
    let runnerId: string | null = null
    let scopeName: string | null = null

    if (rec.role === 'STORE_MANAGER' || rec.role === 'KITCHEN_STAFF') {
      const store = rec.store ? m.storeByName.get(rec.store.trim().toLowerCase()) : undefined
      if (!store) throw new Error(`store "${rec.store ?? '(blank)'}" not found — use the exact store name`)
      storeId = store.id
      scopeName = store.name
    } else if (rec.role === 'BLOCK_MANAGER') {
      const block = rec.block ? m.blockByName.get(rec.block.trim().toLowerCase()) : undefined
      if (!block) throw new Error(`block "${rec.block ?? '(blank)'}" not found — use the exact block name`)
      blockId = block.id
      scopeName = block.name
    } else if (rec.role === 'RUNNER') {
      const zone = rec.zone ? m.zoneByName.get(rec.zone.trim().toLowerCase()) : undefined
      if (!zone) throw new Error(`delivery zone "${rec.zone ?? '(blank)'}" not found — use the exact zone name`)
      scopeName = zone.name
      const runner = await db.runner.create({
        data: { name: rec.name, phone: rec.phone ?? pseudoPhoneFor(rec.email), zoneId: zone.id, isOnDuty: true },
      })
      runnerId = runner.id
    }

    const phone = rec.phone ?? pseudoPhoneFor(rec.email)
    const user = await db.user.create({
      data: {
        name: rec.name,
        email: rec.email,
        phone,
        role: rec.role,
        campusId,
        storeId,
        blockId,
        runnerId,
        passwordHash: await hashPassword(rec.password ?? fallbackPassword()),
        isActive: rec.active ?? true,
      },
      select: { id: true },
    })

    await audit({
      actorRole: 'CAMPUS_ADMIN',
      actorRef: 'sheet-sync',
      action: 'STAFF_CREATED',
      entityType: 'User',
      entityId: user.id,
      campusId,
      meta: { via: 'sheet', email: rec.email, role: rec.role, scopeName, row: rec.rowNumber },
    })
    byEmail.set(rec.email, {
      id: user.id,
      email: rec.email,
      name: rec.name,
      role: rec.role,
      isActive: rec.active ?? true,
      storeId,
      blockId,
      runnerId,
      phone,
    })
  }

  async function applyUpdate(rec: SheetRecord, prior: ExistingUser): Promise<'unchanged' | 'deactivated' | 'updated'> {
    const data: Record<string, unknown> = {}
    const notes: string[] = []

    if (rec.name !== prior.name) data.name = rec.name
    if (rec.phone && rec.phone !== prior.phone) data.phone = rec.phone
    if (rec.active !== null && rec.active !== prior.isActive) data.isActive = rec.active

    if (rec.role !== prior.role) {
      data.role = rec.role
      notes.push(`role→${rec.role}`)
      // resolve scope for the NEW role (old scope fields stay when leaving them)
      if (rec.role === 'STORE_MANAGER' || rec.role === 'KITCHEN_STAFF') {
        const store = rec.store ? maps.storeByName.get(rec.store.trim().toLowerCase()) : undefined
        if (!store) throw new Error(`cannot change role: store "${rec.store ?? '(blank)'}" not found`)
        data.storeId = store.id
        notes.push(store.name)
      } else if (rec.role === 'BLOCK_MANAGER') {
        const block = rec.block ? maps.blockByName.get(rec.block.trim().toLowerCase()) : undefined
        if (!block) throw new Error(`cannot change role: block "${rec.block ?? '(blank)'}" not found`)
        data.blockId = block.id
        notes.push(block.name)
      } else if (rec.role === 'RUNNER') {
        const zone = rec.zone ? maps.zoneByName.get(rec.zone.trim().toLowerCase()) : undefined
        if (!zone) throw new Error(`cannot change role: delivery zone "${rec.zone ?? '(blank)'}" not found`)
        const runner = await db.runner.create({
          data: { name: rec.name, phone: rec.phone ?? prior.phone, zoneId: zone.id, isOnDuty: true },
        })
        data.runnerId = runner.id
        notes.push(zone.name)
      } else if (rec.role === 'CAMPUS_ADMIN') {
        // campus-wide scope — campusId already set
      }
    }

    if (rec.password) {
      data.passwordHash = await hashPassword(rec.password)
      notes.push('password reset')
    }

    if (Object.keys(data).length === 0) return 'unchanged'

    await db.user.update({ where: { id: prior.id }, data })
    await audit({
      actorRole: 'CAMPUS_ADMIN',
      actorRef: 'sheet-sync',
      action: data.isActive === false ? 'STAFF_DEACTIVATED' : 'STAFF_UPDATED',
      entityType: 'User',
      entityId: prior.id,
      meta: { via: 'sheet', email: rec.email, changes: [...Object.keys(data).filter((k) => k !== 'passwordHash'), ...notes], row: rec.rowNumber },
    })
    return data.isActive === false ? 'deactivated' : 'updated'
  }
}
