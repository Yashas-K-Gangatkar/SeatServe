// Sheet-sync engine — pure, testable core for the staff-roster sheet.
//
// The owner maintains a roster sheet (a published Google Sheet OR a Microsoft
// 365 Excel workbook in OneDrive/SharePoint); a cron route
// (src/app/api/cron/sheet-sync) fetches it on a schedule and applies it
// to the staff User table — create / update / deactivate, never delete.
// This module owns everything that does NOT touch the DB or network:
//   - RFC4180-lite CSV parsing (quotes, escaped quotes, commas, CRLF)
//   - a shared grid mapper so .xlsx grids and CSV rows get identical,
//     forgiving header aliases (name/fullname, email/id/login, role/post…)
//   - row validation with precise skip reasons
// Secrets (password column) are validated but NEVER echoed into results.

export const SYNC_ROLES = [
  'CAMPUS_ADMIN',
  'BLOCK_MANAGER',
  'STORE_MANAGER',
  'KITCHEN_STAFF',
  'RUNNER',
] as const

export type SyncRole = (typeof SYNC_ROLES)[number]

export type SheetRecord = {
  rowNumber: number
  name: string
  email: string
  role: SyncRole
  campus: string | null // null/blank → default (first) campus
  store: string | null
  block: string | null
  zone: string | null
  phone: string | null
  password: string | null
  active: boolean | null // null = column absent/blank → create:true, update:no-change
}

export type ParsedRow =
  | { ok: true; record: SheetRecord }
  | { ok: false; rowNumber: number; email: string | null; reason: string }

export type SheetParse = {
  headerFound: boolean
  rows: ParsedRow[]
  total: number
}

// ─────────────────────────── CSV parsing ───────────────────────────

/** RFC4180-lite: quoted fields, "" escapes, commas in quotes, CR/LF/CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  const src = text.replace(/^\uFEFF/, '') // strip BOM

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else if (ch === '\r') {
      // swallow — \n (or end) closes the row
      if (src[i + 1] !== '\n') {
        row.push(field)
        field = ''
        rows.push(row)
        row = []
      }
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// ─────────────────────────── header mapping ───────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

const FIELD_ALIASES: Record<string, keyof RowFields> = {}
for (const alias of ['name', 'fullname', 'staffname', 'person', 'empname']) FIELD_ALIASES[norm(alias)] = 'name'
for (const alias of ['email', 'emailid', 'id', 'loginid', 'login', 'username', 'user']) FIELD_ALIASES[norm(alias)] = 'email'
for (const alias of ['role', 'designation', 'post', 'job', 'jobrole']) FIELD_ALIASES[norm(alias)] = 'role'
for (const alias of ['campus', 'campusname', 'college', 'collegename', 'university']) FIELD_ALIASES[norm(alias)] = 'campus'
for (const alias of ['store', 'storename', 'outlet', 'shop', 'canteen']) FIELD_ALIASES[norm(alias)] = 'store'
for (const alias of ['block', 'blockname', 'building', 'department']) FIELD_ALIASES[norm(alias)] = 'block'
for (const alias of ['zone', 'zonename', 'deliveryzone', 'area']) FIELD_ALIASES[norm(alias)] = 'zone'
for (const alias of ['phone', 'mobile', 'whatsapp', 'number', 'contact', 'phonenumber']) FIELD_ALIASES[norm(alias)] = 'phone'
for (const alias of ['password', 'pass', 'pwd']) FIELD_ALIASES[norm(alias)] = 'password'
for (const alias of ['active', 'status', 'enabled']) FIELD_ALIASES[norm(alias)] = 'active'

type RowFields = Partial<Record<'name' | 'email' | 'role' | 'campus' | 'store' | 'block' | 'zone' | 'phone' | 'password' | 'active', string>>

// ─────────────────────────── row mapping ───────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^\+?\d{10,13}$/

function parseActive(raw: string | undefined): boolean | null | 'invalid' {
  if (raw === undefined) return null
  const v = raw.trim().toLowerCase()
  if (v === '') return null
  if (['true', 'yes', 'y', '1', 'active'].includes(v)) return true
  if (['false', 'no', 'n', '0', 'inactive', 'disabled'].includes(v)) return false
  return 'invalid'
}

function validatePassword(raw: string): string | null {
  // mirrors the Team-panel rules (zod in /api/admin/staff)
  if (raw.length < 8) return 'password must be at least 8 characters'
  if (raw.length > 72) return 'password must be at most 72 characters'
  if (!/[A-Za-z]/.test(raw)) return 'password needs at least one letter'
  if (!/\d/.test(raw)) return 'password needs at least one number'
  return null
}

/** Parse a whole CSV sheet into validated records (pure — no I/O). */
export function mapSheet(text: string): SheetParse {
  return mapGrid(parseCsv(text))
}

/**
 * Map a raw grid (CSV rows or an .xlsx worksheet) into validated records.
 * Blank rows are skipped; row numbers are 1-based with the header as row 1.
 */
export function mapGrid(gridRaw: string[][]): SheetParse {
  const grid = gridRaw.filter((r) => r.some((c) => (c ?? '').trim() !== ''))
  if (grid.length === 0) return { headerFound: false, rows: [], total: 0 }

  const header = grid[0].map(norm)
  const colOf: Partial<Record<keyof RowFields, number>> = {}
  header.forEach((h, idx) => {
    const field = FIELD_ALIASES[h]
    if (field && colOf[field] === undefined) colOf[field] = idx
  })
  const headerFound = colOf.name !== undefined && colOf.email !== undefined && colOf.role !== undefined

  const rows: ParsedRow[] = []
  for (let i = 1; i < grid.length; i++) {
    const cells = grid[i]
    const rowNumber = i + 1 // 1-based, header is row 1
    const get = (f: keyof RowFields): string | undefined => {
      const idx = colOf[f]
      return idx === undefined ? undefined : (cells[idx] ?? '').trim()
    }

    const emailRaw = (get('email') ?? '').toLowerCase()
    if (!emailRaw) {
      rows.push({ ok: false, rowNumber, email: null, reason: 'missing email (login ID) — every row needs one' })
      continue
    }
    if (!EMAIL_RE.test(emailRaw)) {
      rows.push({ ok: false, rowNumber, email: emailRaw, reason: 'not a valid email address' })
      continue
    }

    const name = (get('name') ?? '').trim()
    if (name.length < 2 || name.length > 60) {
      rows.push({ ok: false, rowNumber, email: emailRaw, reason: 'name must be 2–60 characters' })
      continue
    }

    const roleRaw = (get('role') ?? '').toUpperCase().replace(/[\s-]+/g, '_')
    if (!roleRaw) {
      rows.push({ ok: false, rowNumber, email: emailRaw, reason: 'missing role' })
      continue
    }
    if (!SYNC_ROLES.includes(roleRaw as SyncRole)) {
      rows.push({
        ok: false,
        rowNumber,
        email: emailRaw,
        reason: `unknown role "${get('role')}" — use one of: ${SYNC_ROLES.join(', ')}`,
      })
      continue
    }
    const role = roleRaw as SyncRole

    const phoneRaw = (get('phone') ?? '').replace(/[\s-]/g, '')
    if (phoneRaw && !PHONE_RE.test(phoneRaw)) {
      rows.push({ ok: false, rowNumber, email: emailRaw, reason: 'phone must be 10–13 digits (with optional +91)' })
      continue
    }

    const passwordRaw = get('password') ?? ''
    if (passwordRaw) {
      const pwdErr = validatePassword(passwordRaw)
      if (pwdErr) {
        rows.push({ ok: false, rowNumber, email: emailRaw, reason: pwdErr })
        continue
      }
    }

    const activeRaw = parseActive(get('active'))
    if (activeRaw === 'invalid') {
      rows.push({ ok: false, rowNumber, email: emailRaw, reason: 'active must be TRUE or FALSE' })
      continue
    }

    rows.push({
      ok: true,
      record: {
        rowNumber,
        name,
        email: emailRaw,
        role,
        campus: get('campus') || null,
        store: get('store') || null,
        block: get('block') || null,
        zone: get('zone') || null,
        phone: phoneRaw || null,
        password: passwordRaw || null,
        active: activeRaw,
      },
    })
  }

  return { headerFound, rows, total: rows.length }
}

/** Deterministic pseudo-phone for rows without one (phone is NOT NULL+UNIQUE). */
export function pseudoPhoneFor(email: string): string {
  let h = 2166136261
  for (let i = 0; i < email.length; i++) {
    h ^= email.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const digits = (h >>> 0).toString().padStart(10, '7').slice(-9)
  return `+919${digits}`
}
