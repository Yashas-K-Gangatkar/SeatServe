// Sheet-sync engine tests — CSV parsing, header aliases, validation, outcomes.
import { describe, expect, test } from 'bun:test'
import { mapSheet, parseCsv, pseudoPhoneFor } from '../src/lib/sheet-sync'

describe('parseCsv', () => {
  test('simple rows', () => {
    expect(parseCsv('a,b,c\nd,e,f')).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ])
  })

  test('quoted fields with commas and escaped quotes', () => {
    const out = parseCsv('"Yashas, Jr.","say ""hi""",x')
    expect(out[0][0]).toBe('Yashas, Jr.')
    expect(out[0][1]).toBe('say "hi"')
    expect(out[0][2]).toBe('x')
  })

  test('CRLF and trailing newline', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  test('BOM stripped', () => {
    expect(parseCsv('\uFEFFa,b')[0][0]).toBe('a')
  })

  test('lone \r closes rows (old-Mac style)', () => {
    expect(parseCsv('a,b\rc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })
})

describe('mapSheet', () => {
  const SHEET = [
    'Name,Email ID,Designation,Store,Phone,Password,Active',
    'Ravi Kumar,ravi@example.com,KITCHEN_STAFF,Wraphouse,+91 98765 43210,Snacks2Go,yes',
    'Priya,priya@example.com,store manager,wraphouse,,,', // aliases + blank phone/pwd + blank active
    'Bad Role,bad@example.com,CEO,,,,',
    'No Email,,KITCHEN_STAFF,,,,',
    'S,s@x.io,RUNNER,,,,,',
    'Bad Phone,ph@example.com,STORE_MANAGER,Some Store,12345,,',
    'Weak Pass,pw@example.com,RUNNER,Zone A,,short,no',
    'Deactivate Me,off@example.com,STORE_MANAGER,Wraphouse,,,FALSE',
  ].join('\n')

  test('header aliases resolved case/space-insensitively', () => {
    const { headerFound, rows, total } = mapSheet(SHEET)
    expect(headerFound).toBe(true)
    expect(total).toBe(8)
    const ok = rows.filter((r) => r.ok) as Extract<(typeof rows)[number], { ok: true }>[]
    expect(ok).toHaveLength(3)
  })

  test('valid row normalized (email lc, phone cleaned, role case-insensitive)', () => {
    const { rows } = mapSheet(SHEET)
    const ravi = rows.find((r) => r.ok && r.record.email === 'ravi@example.com')
    expect(ravi && ravi.ok).toBe(true)
    if (ravi && ravi.ok) {
      expect(ravi.record.role).toBe('KITCHEN_STAFF')
      expect(ravi.record.phone).toBe('+919876543210')
      expect(ravi.record.active).toBe(true)
      expect(ravi.record.store).toBe('Wraphouse')
    }
  })

  test('blank optional cells → null; blank active → null (no-change)', () => {
    const { rows } = mapSheet(SHEET)
    const priya = rows.find((r) => r.ok && r.record.email === 'priya@example.com')
    expect(priya && priya.ok).toBe(true)
    if (priya && priya.ok) {
      expect(priya.record.role).toBe('STORE_MANAGER')
      expect(priya.record.phone).toBeNull()
      expect(priya.record.password).toBeNull()
      expect(priya.record.active).toBeNull()
    }
  })

  test('skips carry precise reasons and row numbers', () => {
    const { rows } = mapSheet(SHEET)
    const bad = rows.filter((r) => !r.ok) as Extract<(typeof rows)[number], { ok: false }>[]
    const reasons = bad.map((b) => b.reason)
    expect(reasons.some((r) => r.includes('unknown role'))).toBe(true)
    expect(reasons.some((r) => r.includes('missing email'))).toBe(true)
    expect(reasons.some((r) => r.includes('2–60'))).toBe(true) // 'Shorty' < 2 chars
    expect(reasons.some((r) => r.includes('10–13 digits'))).toBe(true)
    expect(reasons.some((r) => r.includes('at least 8 characters'))).toBe(true)
    // row numbers are 1-based incl. header
    const noEmail = bad.find((b) => b.reason.includes('missing email'))
    expect(noEmail?.rowNumber).toBe(5)
  })

  test('deactivate flag parsed FALSE', () => {
    const { rows } = mapSheet(SHEET)
    const off = rows.find((r) => r.ok && r.record.email === 'off@example.com')
    expect(off && off.ok).toBe(true)
    if (off && off.ok) expect(off.record.active).toBe(false)
  })

  test('unrecognized header → headerFound false', () => {
    expect(mapSheet('foo,bar\nx,y').headerFound).toBe(false)
  })

  test('password rules mirror the team panel (letter + digit, 8+)', () => {
    const { rows } = mapSheet('Name,Email,Role,Password\nXavier,a@b.com,RUNNER,onlyletters')
    expect(rows[0].ok).toBe(false)
    if (!rows[0].ok) expect(rows[0].reason).toContain('one number')
  })
})

describe('pseudoPhoneFor', () => {
  test('deterministic and valid format', () => {
    const a = pseudoPhoneFor('new1@example.com')
    const b = pseudoPhoneFor('new1@example.com')
    expect(a).toBe(b)
    expect(a).toMatch(/^\+919\d{9}$/)
  })

  test('different emails differ (probability)', () => {
    const set = new Set(Array.from({ length: 50 }, (_, i) => pseudoPhoneFor(`user${i}@example.com`)))
    expect(set.size).toBe(50)
  })
})

describe('campus column (multi-campus sheets)', () => {
  test('campus/college aliases map and land on the record', () => {
    const a = mapSheet('Name,Email,Role,Campus\nAsha,a@x.io,KITCHEN_STAFF,Sapthagiri NPS University')
    expect(a.rows[0].ok).toBe(true)
    if (a.rows[0].ok) expect(a.rows[0].record.campus).toBe('Sapthagiri NPS University')

    const b = mapSheet('Name,Email,Role,College Name\nBasil,b@x.io,RUNNER,Nova Degree College')
    expect(b.rows[0].ok).toBe(true)
    if (b.rows[0].ok) expect(b.rows[0].record.campus).toBe('Nova Degree College')
  })

  test('absent or blank campus → null (engine defaults to first campus)', () => {
    const noCol = mapSheet('Name,Email,Role\nAsha,a@x.io,KITCHEN_STAFF')
    expect(noCol.rows[0].ok).toBe(true)
    if (noCol.rows[0].ok) expect(noCol.rows[0].record.campus).toBeNull()

    const blank = mapSheet('Name,Email,Role,Campus\nAsha,a@x.io,KITCHEN_STAFF,')
    expect(blank.rows[0].ok).toBe(true)
    if (blank.rows[0].ok) expect(blank.rows[0].record.campus).toBeNull()
  })

  test('campus column does not break the other aliases (mixed column order)', () => {
    const out = mapSheet('Campus,Role,Email,Store,Name,Password,Active\nSapthagiri NPS University,KITCHEN_STAFF,c@x.io,Wraphouse Kitchen,Chef C,Test@1234,TRUE')
    expect(out.headerFound).toBe(true)
    const r = out.rows[0]
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.record.campus).toBe('Sapthagiri NPS University')
      expect(r.record.store).toBe('Wraphouse Kitchen')
      expect(r.record.password).toBe('Test@1234')
      expect(r.record.active).toBe(true)
    }
  })

  test('xlsx-style grids carry campus the same way (mapGrid parity)', () => {
    const grid = [
      ['Name', 'Email', 'Role', 'Campus'],
      ['Runner R', 'r@x.io', 'RUNNER', 'Sapthagiri NPS University'],
    ]
    const out = mapSheet(grid.map((r) => r.join(',')).join('\n'))
    expect(out.rows[0].ok).toBe(true)
    if (out.rows[0].ok) expect(out.rows[0].record.campus).toBe('Sapthagiri NPS University')
  })
})
