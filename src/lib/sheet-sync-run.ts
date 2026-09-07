// runSheetSync — the sheet-sync engine's DB half, shared by two callers:
//   • GET /api/cron/sheet-sync (cron + manual pings)
//   • src/lib/sheet-autosync (throttled background pull when someone tries to
//     log in with credentials the server doesn't recognize yet — the sheet may
//     have their row moments ago)
//
// Downloads the roster sheet (Microsoft 365 / OneDrive share link, Google CSV,
// or any direct .xlsx/.csv URL), parses it, and applies it to the staff User
// table: create / update / deactivate, never delete. Pure outcome object —
// callers decide how to wrap it in a Response.

import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { mapGrid, mapSheet, pseudoPhoneFor, type SheetParse, type SheetRecord } from '@/lib/sheet-sync'
import { ROSTER_STATE_KEY, emptyRosterState, parseRosterState, rosterEmailsFromParse, type RosterState } from '@/lib/sheet-gate'
import { fetchSheet } from '@/lib/sheet-fetch'
import { readXlsxGrid } from '@/lib/xlsx-read'

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
  campusId: string
  storeId: string | null
  blockId: string | null
  runnerId: string | null
  phone: string
  passwordHash: string
}

/** True when the sheet password differs from the stored hash (unverifiable hash counts as different). */
async function passwordDiffers(sheetPassword: string, storedHash: string): Promise<boolean> {
  try {
    return !(await verifyPassword(sheetPassword, storedHash))
  } catch {
    return true
  }
}

type ParsedRow = ReturnType<typeof mapSheet>['rows'][number]

export type SheetSyncOutcome =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; status: number; error: string }

export async function runSheetSync(dry: boolean): Promise<SheetSyncOutcome> {
  const sheetUrl = process.env.SHEET_SYNC_URL?.trim()
  if (!sheetUrl) {
    return {
      ok: true,
      payload: {
        enabled: false,
        note: 'Set SHEET_SYNC_URL (Microsoft 365 / OneDrive share link, Google-Sheet CSV, or any direct .xlsx/.csv URL) to activate sheet-sync.',
      },
    }
  }

  // Roster-gate state (login refuses emails that are not in the last
  // successfully-read sheet). Real runs keep it current; dry runs only report.
  const priorState = parseRosterState((await db.appSetting.findUnique({ where: { key: ROSTER_STATE_KEY } }))?.value)
  const writeRosterState = async (patch: Partial<RosterState>): Promise<RosterState> => {
    const next: RosterState = { ...emptyRosterState(), ...(priorState ?? {}), ...patch }
    await db.appSetting.upsert({
      where: { key: ROSTER_STATE_KEY },
      update: {
        value: JSON.stringify(next),
      },
      create: { key: ROSTER_STATE_KEY, value: JSON.stringify(next) },
    })
    return next
  }

  // 1. download the sheet (xlsx bytes or csv text; login pages rejected)
  const fetched = await fetchSheet(sheetUrl)
  if (!fetched.ok) {
    if (!dry) await writeRosterState({ lastError: fetched.error, lastErrorAt: new Date().toISOString() })
    return { ok: false, status: fetched.status, error: fetched.error }
  }

  // 2. parse + validate (identical rules for Excel grids and CSV rows)
  let parse: SheetParse
  try {
    parse = fetched.kind === 'xlsx' ? mapGrid(readXlsxGrid(fetched.bytes)) : mapSheet(fetched.text)
  } catch (err) {
    const msg = `Could not read the sheet: ${err instanceof Error ? err.message : 'unknown format'}`
    if (!dry) await writeRosterState({ lastError: msg, lastErrorAt: new Date().toISOString() })
    return { ok: false, status: 422, error: msg }
  }
  const { headerFound, rows, total } = parse
  if (!headerFound) {
    const msg = 'Sheet header row not recognized — needs at least: name, email, role columns'
    if (!dry) await writeRosterState({ lastError: msg, lastErrorAt: new Date().toISOString() })
    return { ok: false, status: 422, error: msg }
  }
  if (total > MAX_ROWS) return { ok: false, status: 422, error: `Sheet has ${total} rows — limit is ${MAX_ROWS}` }

  // 2b. the sheet was read successfully — snapshot its emails as the roster
  // gate truth BEFORE applying rows (the sheet, not the apply result, decides
  // who may log in). Skipped-with-email rows still count as "on the roster".
  const rosterEmails = rosterEmailsFromParse(parse)
  if (!dry) {
    await writeRosterState({
      emails: rosterEmails,
      lastSuccessAt: new Date().toISOString(),
      lastError: null,
      lastErrorAt: null,
    })
  }

  const good = rows.filter((r): r is Extract<ParsedRow, { ok: true }> => r.ok)
  const skipped = rows
    .filter((r): r is Extract<ParsedRow, { ok: false }> => !r.ok)
    .map((r) => ({ email: r.email, row: r.rowNumber, reason: r.reason }))

  // 3. load lookup data + existing staff (multi-campus: rows may target any
  // campus by name via the optional Campus column; blank → first campus)
  const campuses = await db.campus.findMany({ orderBy: { createdAt: 'asc' } })
  if (campuses.length === 0) return { ok: false, status: 404, error: 'No campus configured' }
  const defaultCampus = campuses[0]
  const normName = (s: string) => s.trim().toLowerCase()
  const campusByName = new Map(campuses.map((c) => [normName(c.name), c]))

  const [stores, blocks, zones, existing] = await Promise.all([
    db.store.findMany({ select: { id: true, name: true, campusId: true } }),
    db.block.findMany({ select: { id: true, name: true, campusId: true } }),
    db.deliveryZone.findMany({ select: { id: true, name: true, campusId: true } }),
    db.user.findMany({
      where: { role: { not: 'CUSTOMER' } },
      select: { id: true, email: true, name: true, role: true, isActive: true, campusId: true, storeId: true, blockId: true, runnerId: true, phone: true, passwordHash: true },
    }),
  ])

  // scope names resolve ONLY within the row's campus — never across campuses
  const mapsFor = (campusId: string): NameMaps => ({
    storeByName: new Map(stores.filter((s) => s.campusId === campusId).map((s) => [normName(s.name), s])),
    blockByName: new Map(blocks.filter((b) => b.campusId === campusId).map((b) => [normName(b.name), b])),
    zoneByName: new Map(zones.filter((z) => z.campusId === campusId).map((z) => [normName(z.name), z])),
  })
  const byEmail = new Map(existing.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u])) as Map<string, ExistingUser>

  const created: string[] = []
  const updated: string[] = []
  const deactivated: string[] = []
  const unchanged: string[] = []

  // 4. apply row by row — one bad row never blocks the rest
  for (const { record } of good) {
    const prior = byEmail.get(record.email)
    try {
      const campus = record.campus ? campusByName.get(normName(record.campus)) : defaultCampus
      if (!campus) {
        skipped.push({ email: record.email, row: record.rowNumber, reason: `campus "${record.campus}" not found — use the exact campus name` })
        continue
      }
      const maps = mapsFor(campus.id)
      if (!prior) {
        if (dry) {
          created.push(record.email)
          continue
        }
        await applyCreate(record, campus, maps)
        created.push(record.email)
        continue
      }
      if (dry) {
        const diff = await diffFor(record, prior, campus)
        if (diff.length === 0) unchanged.push(record.email)
        else if (diff.length === 1 && diff[0] === 'active=false') deactivated.push(record.email)
        else updated.push(record.email)
        continue
      }
      const result = await applyUpdate(record, prior, campus, maps)
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
    return {
      ok: true,
      payload: {
        enabled: true,
        dry: true,
        source: fetched.kind,
        fetchedVia: fetched.via,
        campus: defaultCampus.name,
        rows: total,
        wouldCreate: created,
        wouldUpdate: updated,
        wouldDeactivate: deactivated,
        unchanged,
        skipped,
        rosterGate: {
          armedNow: (priorState?.emails.length ?? 0) > 0,
          wouldArm: rosterEmails.length > 0,
          wouldTrack: rosterEmails.length,
        },
      },
    }
  }

  return {
    ok: true,
    payload: {
      enabled: true,
      dry: false,
      source: fetched.kind,
      fetchedVia: fetched.via,
      campus: defaultCampus.name,
      rows: total,
      created,
      updated,
      deactivated,
      unchanged,
      skipped,
      rosterGate: {
        armed: rosterEmails.length > 0,
        tracked: rosterEmails.length,
        lastSuccessAt: new Date().toISOString(),
      },
    },
  }

  // ── helpers ──────────────────────────────────────────────────────

  async function diffFor(rec: SheetRecord, prior: ExistingUser, campus: { id: string; name: string }): Promise<string[]> {
    const diffs: string[] = []
    if (rec.name !== prior.name) diffs.push('name')
    if (rec.role !== prior.role) diffs.push('role')
    if (campus.id !== prior.campusId) diffs.push(`campus→${campus.name}`)
    if (rec.phone && rec.phone !== prior.phone) diffs.push('phone')
    if (rec.active !== null && rec.active !== prior.isActive) diffs.push(rec.active ? 'active=true' : 'active=false')
    if (rec.password && (await passwordDiffers(rec.password, prior.passwordHash))) diffs.push('password')
    return diffs
  }

  async function applyCreate(rec: SheetRecord, campus: { id: string; name: string }, m: NameMaps) {
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
    const passwordHash = await hashPassword(rec.password ?? fallbackPassword())
    const user = await db.user.create({
      data: {
        name: rec.name,
        email: rec.email,
        phone,
        role: rec.role,
        campusId: campus.id,
        storeId,
        blockId,
        runnerId,
        passwordHash,
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
      campusId: campus.id,
      meta: { via: 'sheet', email: rec.email, role: rec.role, campus: campus.name, scopeName, row: rec.rowNumber },
    })
    byEmail.set(rec.email, {
      id: user.id,
      email: rec.email,
      name: rec.name,
      role: rec.role,
      isActive: rec.active ?? true,
      campusId: campus.id,
      storeId,
      blockId,
      runnerId,
      phone,
      passwordHash,
    })
  }

  async function applyUpdate(
    rec: SheetRecord,
    prior: ExistingUser,
    campus: { id: string; name: string },
    maps: NameMaps,
  ): Promise<'unchanged' | 'deactivated' | 'updated'> {
    const data: Record<string, unknown> = {}
    const notes: string[] = []

    if (campus.id !== prior.campusId) {
      data.campusId = campus.id
      notes.push(`campus→${campus.name}`)
    }
    if (rec.name !== prior.name) data.name = rec.name
    if (rec.phone && rec.phone !== prior.phone) data.phone = rec.phone
    if (rec.active !== null && rec.active !== prior.isActive) data.isActive = rec.active

    if (rec.role !== prior.role) {
      data.role = rec.role
      notes.push(`role→${rec.role}`)
    }

    // scope must be (re)resolved for a NEW role or a campus move — never guessed
    if (rec.role !== prior.role || campus.id !== prior.campusId) {
      if (rec.role === 'STORE_MANAGER' || rec.role === 'KITCHEN_STAFF') {
        const store = rec.store ? maps.storeByName.get(rec.store.trim().toLowerCase()) : undefined
        if (!store) throw new Error(`cannot apply change: store "${rec.store ?? '(blank)'}" not found in ${campus.name}`)
        data.storeId = store.id
        notes.push(store.name)
      } else if (rec.role === 'BLOCK_MANAGER') {
        const block = rec.block ? maps.blockByName.get(rec.block.trim().toLowerCase()) : undefined
        if (!block) throw new Error(`cannot apply change: block "${rec.block ?? '(blank)'}" not found in ${campus.name}`)
        data.blockId = block.id
        notes.push(block.name)
      } else if (rec.role === 'RUNNER') {
        const zone = rec.zone ? maps.zoneByName.get(rec.zone.trim().toLowerCase()) : undefined
        if (!zone) throw new Error(`cannot apply change: delivery zone "${rec.zone ?? '(blank)'}" not found in ${campus.name}`)
        const runner = await db.runner.create({
          data: { name: rec.name, phone: rec.phone ?? prior.phone, zoneId: zone.id, isOnDuty: true },
        })
        data.runnerId = runner.id
        notes.push(zone.name)
      } else if (rec.role === 'CAMPUS_ADMIN') {
        // campus-wide scope — campusId already set above
      }
    }

    if (rec.password && (await passwordDiffers(rec.password, prior.passwordHash))) {
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
      campusId: campus.id,
      meta: { via: 'sheet', email: rec.email, campus: campus.name, changes: [...Object.keys(data).filter((k) => k !== 'passwordHash'), ...notes], row: rec.rowNumber },
    })
    return data.isActive === false ? 'deactivated' : 'updated'
  }
}
