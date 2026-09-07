// Sheet formats — tests for the Microsoft 365 / Excel + multi-link support:
// zip reader, xlsx grid extraction, shared link candidates, byte sniffing,
// and the fetch pipeline (login-page rejection, candidate fallback).
import { describe, expect, test } from 'bun:test'
import { deflateRawSync } from 'node:zlib'
import { readXlsxGrid, unzipEntries } from '../src/lib/xlsx-read'
import {
  candidateFetchUrls,
  classifySheetLink,
  normalizeSheetUrl,
  oneDriveSharesApiUrl,
  sniffSheetBytes,
} from '../src/lib/sheet-link'
import { fetchSheet } from '../src/lib/sheet-fetch'
import { mapGrid } from '../src/lib/sheet-sync'

// ───────────── tiny ZIP writer (fixtures, no binary files needed) ─────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

type ZipSpec = { name: string; data: Buffer; method?: 0 | 8 }

function makeZip(entries: ZipSpec[]): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const e of entries) {
    const method = e.method ?? 0
    const comp = method === 8 ? deflateRawSync(e.data) : e.data
    const nameBuf = Buffer.from(e.name, 'utf8')
    const crc = crc32(e.data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(comp.length, 18)
    local.writeUInt32LE(e.data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    localParts.push(local, nameBuf, comp)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(comp.length, 20)
    central.writeUInt32LE(e.data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, nameBuf)

    offset += 30 + nameBuf.length + comp.length
  }

  const centralBuf = Buffer.concat(centralParts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...localParts, centralBuf, eocd])
}

function buildXlsx(parts: Record<string, string>, method: 0 | 8 = 8): Buffer {
  return makeZip(Object.entries(parts).map(([name, xml]) => ({ name, data: Buffer.from(xml, 'utf8'), method })))
}

// ───────────── xlsx fixtures ─────────────

const WORKBOOK_XML =
  '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  '<sheets><sheet name="Staff" sheetId="1" r:id="rId1"/></sheets></workbook>'

const WORKBOOK_RELS_XML =
  '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
  'Target="worksheets/sheet1.xml"/></Relationships>'

const SST_XML =
  '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  ['Name', 'Email', 'Role', 'Store', 'Phone', 'Active', 'KITCHEN_STAFF', 'Wraphouse', 'ravi@example.com', 'Priya Sharma', 'priya@example.com', 'STORE_MANAGER', 'Off Person', 'off@example.com']
    .map((s) => `<si><t>${s}</t></si>`)
    .join('') +
  '</sst>'

// sparse cells, inline strings, shared strings, numeric phone, boolean active,
// self-closing empty cell — the messy reality of a real Excel sheet
const SHEET1_XML =
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
  '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c>' +
  '<c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c><c r="F1" t="s"><v>5</v></c></row>' +
  '<row r="2"><c r="A2" t="inlineStr"><is><t>Ravi &amp; Sons</t></is></c><c r="B2" t="s"><v>8</v></c>' +
  '<c r="C2" t="s"><v>6</v></c><c r="D2" t="s"><v>7</v></c><c r="E2"><v>919876543210</v></c>' +
  '<c r="F2" t="b"><v>1</v></c></row>' +
  '<row r="3"><c r="A3" t="s"><v>9</v></c><c r="B3" t="s"><v>10</v></c><c r="C3" t="s"><v>11</v></c>' +
  '<c r="D3" t="s"><v>7</v></c><c r="E3" s="1"/></row>' +
  '<row r="4"><c r="A4" t="inlineStr"><is><t>Off Person</t></is></c><c r="B4" t="s"><v>13</v></c>' +
  '<c r="C4" t="s"><v>6</v></c><c r="D4" t="s"><v>7</v></c><c r="F4" t="inlineStr"><is><t>FALSE</t></is></c></row>' +
  '</sheetData></worksheet>'

const FULL_XLSX_PARTS = {
  'xl/workbook.xml': WORKBOOK_XML,
  'xl/_rels/workbook.xml.rels': WORKBOOK_RELS_XML,
  'xl/sharedStrings.xml': SST_XML,
  'xl/worksheets/sheet1.xml': SHEET1_XML,
}

// ───────────── tests ─────────────

describe('unzipEntries', () => {
  test('round-trips stored and deflated entries', () => {
    const zip = makeZip([
      { name: 'a/one.txt', data: Buffer.from('hello stored world'), method: 0 },
      { name: 'b/two.xml', data: Buffer.from('<root>deflated payload</root>'), method: 8 },
    ])
    const entries = unzipEntries(new Uint8Array(zip))
    expect(entries.get('a/one.txt')?.toString('utf8')).toBe('hello stored world')
    expect(entries.get('b/two.xml')?.toString('utf8')).toBe('<root>deflated payload</root>')
    expect(entries.size).toBe(2)
  })

  test('rejects non-zip bytes with a clear error', () => {
    expect(() => unzipEntries(new Uint8Array(Buffer.from('this is not a zip file at all')))).toThrow(/ZIP end-of-central/)
  })
})

describe('readXlsxGrid', () => {
  test('parses a real-shaped workbook: shared + inline strings, sparse cells, booleans, numbers', () => {
    const grid = readXlsxGrid(new Uint8Array(buildXlsx(FULL_XLSX_PARTS)))
    expect(grid).toHaveLength(4)
    expect(grid[0]).toEqual(['Name', 'Email', 'Role', 'Store', 'Phone', 'Active'])
    expect(grid[1][0]).toBe('Ravi & Sons') // inline string + entity decode
    expect(grid[1][1]).toBe('ravi@example.com')
    expect(grid[1][4]).toBe('919876543210') // numeric cell
    expect(grid[1][5]).toBe('TRUE') // boolean cell
    expect(grid[2][3]).toBe('Wraphouse')
    expect(grid[2][4]).toBe('') // self-closing empty cell
    expect(grid[3][3]).toBe('Wraphouse')
    expect(grid[3][5]).toBe('FALSE')
  })

  test('works with STORE (uncompressed) entries too', () => {
    const grid = readXlsxGrid(new Uint8Array(buildXlsx(FULL_XLSX_PARTS, 0)))
    expect(grid[1][2]).toBe('KITCHEN_STAFF')
  })

  test('falls back to sheet1.xml when workbook.xml is absent', () => {
    const grid = readXlsxGrid(new Uint8Array(buildXlsx({ 'xl/sharedStrings.xml': SST_XML, 'xl/worksheets/sheet1.xml': SHEET1_XML })))
    expect(grid[0][0]).toBe('Name')
  })

  test('cell placement follows r= references, not DOM order', () => {
    const xml =
      '<worksheet><sheetData><row r="1"><c r="C1" t="inlineStr"><is><t>Role</t></is></c>' +
      '<c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="B1" t="inlineStr"><is><t>Email</t></is></c></row></sheetData></worksheet>'
    const grid = readXlsxGrid(new Uint8Array(buildXlsx({ 'xl/worksheets/sheet1.xml': xml })))
    expect(grid[0]).toEqual(['Name', 'Email', 'Role'])
  })

  test('normalizes scientific-notation numbers to plain integers', () => {
    const xml =
      '<worksheet><sheetData><row r="1"><c r="A1"><v>9.19E11</v></c>' +
      '<c r="B1" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>'
    const grid = readXlsxGrid(new Uint8Array(buildXlsx({ 'xl/worksheets/sheet1.xml': xml })))
    expect(grid[0][0]).toBe('919000000000')
  })

  test('xlsx grid flows through mapGrid with identical validation to CSV', () => {
    const grid = readXlsxGrid(new Uint8Array(buildXlsx(FULL_XLSX_PARTS)))
    const parse = mapGrid(grid)
    expect(parse.headerFound).toBe(true)
    const ok = parse.rows.filter((r) => r.ok)
    expect(ok).toHaveLength(3)
    const ravi = ok.find((r) => r.ok && r.record.email === 'ravi@example.com')
    if (ravi && ravi.ok) {
      expect(ravi.record.role).toBe('KITCHEN_STAFF')
      expect(ravi.record.phone).toBe('919876543210')
      expect(ravi.record.active).toBe(true)
    }
    const off = ok.find((r) => r.ok && r.record.email === 'off@example.com')
    if (off && off.ok) expect(off.record.active).toBe(false)
  })

  test('inlineStr-only workbook (no sharedStrings part) parses', () => {
    const xml =
      '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c>' +
      '<c r="B1" t="inlineStr"><is><t>Email</t></is></c><c r="C1" t="inlineStr"><is><t>Role</t></is></c></row>' +
      '<row r="2"><c r="A1" t="inlineStr"><is><t>Ravi</t></is></c><c r="B2" t="inlineStr"><is><t>r@x.io</t></is></c>' +
      '<c r="C2" t="inlineStr"><is><t>RUNNER</t></is></c></row></sheetData></worksheet>'
    const grid = readXlsxGrid(new Uint8Array(buildXlsx({ 'xl/worksheets/sheet1.xml': xml })))
    expect(mapGrid(grid).headerFound).toBe(true)
  })

  test('garbage bytes produce a readable error, not a crash', () => {
    expect(() => readXlsxGrid(new Uint8Array(Buffer.from('hello world, not excel')))).toThrow(/\.xlsx/)
  })
})

describe('sheet links', () => {
  test('normalize adds scheme and strips fragments', () => {
    expect(normalizeSheetUrl(' 1drv.ms/x/s!abc#credentials ')).toBe('https://1drv.ms/x/s!abc')
  })

  test('classifies the four link families', () => {
    expect(classifySheetLink('https://docs.google.com/spreadsheets/d/X/edit')).toBe('google')
    expect(classifySheetLink('https://1drv.ms/x/s!abc?e=x')).toBe('onedrive')
    expect(classifySheetLink('https://contoso-my.sharepoint.com/:x:/g/personal/u/Ef?e=y')).toBe('sharepoint')
    expect(classifySheetLink('https://files.example.io/roster.xlsx')).toBe('direct')
    expect(classifySheetLink('https://example.com/just-a-page')).toBe('unknown')
  })

  test('OneDrive links → shares API first, download=1 fallback', () => {
    const url = 'https://1drv.ms/x/s!abc?e=x'
    const [first, second] = candidateFetchUrls(url)
    expect(first).toBe(oneDriveSharesApiUrl(url))
    expect(first.startsWith('https://api.onedrive.com/v1.0/shares/u!')).toBe(true)
    expect(first.endsWith('=')).toBe(false) // unpadded base64url
    expect(second).toBe('https://1drv.ms/x/s!abc?e=x&download=1')
  })

  test('SharePoint links try download=1 first (shares API is second)', () => {
    const url = 'https://contoso-my.sharepoint.com/:x:/g/personal/u/Efabc?e=xyz'
    const [first, second] = candidateFetchUrls(url)
    expect(first).toBe(`${url}&download=1`)
    expect(second).toBe(oneDriveSharesApiUrl(url))
  })

  test('Google edit link converts to CSV export preserving gid', () => {
    expect(candidateFetchUrls('https://docs.google.com/spreadsheets/d/ABC/edit#gid=3')).toEqual([
      'https://docs.google.com/spreadsheets/d/ABC/export?format=csv&gid=3',
    ])
    expect(candidateFetchUrls('https://docs.google.com/spreadsheets/d/ABC/edit?usp=sharing&gid=7')).toEqual([
      'https://docs.google.com/spreadsheets/d/ABC/export?format=csv&gid=7',
    ])
  })

  test('already-published Google CSV and direct files stay as-is', () => {
    expect(candidateFetchUrls('https://docs.google.com/spreadsheets/d/ABC/pub?output=csv')).toEqual([
      'https://docs.google.com/spreadsheets/d/ABC/pub?output=csv',
    ])
    expect(candidateFetchUrls('https://files.example.io/roster.csv')).toEqual(['https://files.example.io/roster.csv'])
  })
})

describe('sniffSheetBytes', () => {
  test('ZIP magic wins over a lying content-type', () => {
    const zip = buildXlsx(FULL_XLSX_PARTS)
    expect(sniffSheetBytes(new Uint8Array(zip), 'text/html')).toBe('xlsx')
  })

  test('html, json and csv are told apart', () => {
    expect(sniffSheetBytes(new Uint8Array(Buffer.from('<!DOCTYPE html><html>')), null)).toBe('html')
    expect(sniffSheetBytes(new Uint8Array(Buffer.from('{"error":"AccessDenied"}')), null)).toBe('json')
    expect(sniffSheetBytes(new Uint8Array(Buffer.from('Name,Email,Role')), 'text/csv')).toBe('csv')
  })
})

// ───────────── fetch pipeline (fake fetch) ─────────────

function fetchFromRoutes(routes: Array<{ match: (url: string) => boolean; respond: (url: string) => Response }>): typeof fetch {
  return (async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input)
    for (const r of routes) if (r.match(url)) return r.respond(url)
    return new Response('not found', { status: 404 })
  }) as unknown as typeof fetch
}

describe('fetchSheet', () => {
  test('OneDrive: sign-in page on the shares API falls through to download=1 xlsx', async () => {
    const xlsx = buildXlsx(FULL_XLSX_PARTS)
    const impl = fetchFromRoutes([
      { match: (u) => u.includes('api.onedrive.com'), respond: () => new Response('<html>Sign in</html>', { headers: { 'content-type': 'text/html' } }) },
      { match: (u) => u.includes('download=1'), respond: () => new Response(new Uint8Array(xlsx), { headers: { 'content-type': 'application/octet-stream' } }) },
    ])
    const out = await fetchSheet('https://1drv.ms/x/s!abc?e=x', impl)
    expect(out.ok).toBe(true)
    if (out.ok && out.kind === 'xlsx') {
      expect(out.via).toContain('download=1')
      expect(readXlsxGrid(out.bytes)[0][0]).toBe('Name')
    }
  })

  test('Google edit link is auto-converted and served as CSV', async () => {
    const impl = fetchFromRoutes([
      { match: (u) => u.includes('/export?format=csv'), respond: () => new Response('Name,Email,Role\nRavi,r@x.io,RUNNER', { headers: { 'content-type': 'text/csv' } }) },
    ])
    const out = await fetchSheet('https://docs.google.com/spreadsheets/d/SS1/edit#gid=0', impl)
    expect(out.ok).toBe(true)
    if (out.ok && out.kind === 'csv') {
      expect(out.text).toContain('RUNNER')
    }
  })

  test('a permanently private link produces an actionable error, not a parser crash', async () => {
    const impl = fetchFromRoutes([
      { match: () => true, respond: () => new Response('<html>guest access required</html>', { headers: { 'content-type': 'text/html' } }) },
    ])
    const out = await fetchSheet('https://contoso-my.sharepoint.com/:x:/g/personal/u/Ef?e=y', impl)
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.tried).toHaveLength(2)
      expect(out.error).toContain('Anyone with the link')
    }
  })

  test('JSON API errors are rejected the same way', async () => {
    const impl = fetchFromRoutes([
      { match: () => true, respond: () => new Response('{"error":{"code":"AccessDenied"}}', { headers: { 'content-type': 'application/json' } }) },
    ])
    const out = await fetchSheet('https://1drv.ms/x/s!abc', impl)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toContain('JSON')
  })

  test('direct xlsx URL downloads first try', async () => {
    const xlsx = buildXlsx(FULL_XLSX_PARTS)
    const impl = fetchFromRoutes([
      { match: () => true, respond: () => new Response(new Uint8Array(xlsx)) },
    ])
    const out = await fetchSheet('https://files.example.io/roster.xlsx', impl)
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.kind).toBe('xlsx')
  })

  test('OneDrive redeem dance: cookies set on a redirect are replayed on the next hop (migrated-to-SPO accounts)', async () => {
    const xlsx = buildXlsx(FULL_XLSX_PARTS)
    const seen: Array<{ url: string; cookie?: string }> = []
    const impl = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const cookie = (init?.headers as Record<string, string> | undefined)?.cookie
      seen.push({ url, cookie })
      if (url.includes('api.onedrive.com')) {
        // shares API rejects these migrated-account links outright
        return Promise.resolve(new Response('{"error":{"code":"unauthenticated"}}', { headers: { 'content-type': 'application/json' } }))
      }
      if (url.includes('1drv.ms')) {
        // first hop: redirect + anonymous guest cookie (like Authenticate.aspx)
        return Promise.resolve(new Response(null, {
          status: 302,
          headers: { location: 'https://onedrive.live.com/personal/u/Documents/Book2.xlsx?redeem=1', 'set-cookie': 'FedAuth=anon-guest-77; path=/; HttpOnly' },
        }))
      }
      if (cookie === 'FedAuth=anon-guest-77') {
        return Promise.resolve(new Response(new Uint8Array(xlsx), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } }))
      }
      // no cookie → login wall (what the old fetch hit)
      return Promise.resolve(new Response('<html>Sign in</html>', { headers: { 'content-type': 'text/html' } }))
    }) as unknown as typeof fetch

    const out = await fetchSheet('https://1drv.ms/x/c/2BF31EFB856A4D1A/IQD56mkdgRwHSYBjeG', impl)
    expect(out.ok).toBe(true)
    if (out.ok && out.kind === 'xlsx') expect(readXlsxGrid(out.bytes)[0][0]).toBe('Name')
    // hop 0 = shares API, hop 1 = 1drv.ms redirect (jar still empty), hop 2 = cookie replay
    expect(seen[2]?.cookie).toBe('FedAuth=anon-guest-77')
  })

  test('relative Location headers are resolved against the current URL', async () => {
    const impl = fetchFromRoutes([
      { match: (u) => u.includes('1drv.ms'), respond: () => new Response(null, { status: 302, headers: { location: 'https://onedrive.live.com/:x:/g/personal/u?redeem=1' } }) },
      { match: (u) => u.includes('onedrive.live.com/:x:'), respond: () => new Response(null, { status: 302, headers: { location: '/personal/u/Book2.xlsx' } }) },
      { match: (u) => u.includes('/personal/u/Book2.xlsx'), respond: () => new Response('Name,Email\nA,a@x.io', { headers: { 'content-type': 'text/csv' } }) },
    ])
    const out = await fetchSheet('https://1drv.ms/x/c/ABC/DEF', impl)
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.kind).toBe('csv')
  })
})
