// Minimal .xlsx (Open Office XML) reader — zero dependencies.
//
// The Microsoft 365 roster sync downloads the owner's Excel workbook as raw
// .xlsx bytes. An .xlsx file is a ZIP archive of XML parts; this module turns
// those bytes into the same string[][] grid the CSV engine already understands.
//
// Deliberately small and strict about what it accepts:
//   - ZIP: central-directory driven (sizes from the central directory, so
//     streamed entries with data descriptors work), STORE + DEFLATE methods.
//   - Worksheet selection: first <sheet> in xl/workbook.xml resolved through
//     xl/_rels/workbook.xml.rels, with a sheet1.xml fallback.
//   - Cells: placed by their r="C5" reference (never by DOM order — Excel omits
//     empty cells), shared strings / inline strings / formula strings /
//     numbers / booleans, XML entity decoding, scientific-notation numbers
//     normalized back to plain integers.
// Cells that Excel stores as dates come out as their serial number; roster
// columns are text in practice and row validation rejects nonsense safely.

import { inflateRawSync } from 'node:zlib'

// ─────────────────────────── ZIP layer ───────────────────────────

export function unzipEntries(buf: Uint8Array): Map<string, Buffer> {
  const view = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)

  // locate End Of Central Directory (scan back past any ZIP comment)
  let eocd = -1
  const floor = Math.max(0, view.length - 66_000)
  for (let i = view.length - 22; i >= floor; i--) {
    if (view.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('not a valid .xlsx workbook (ZIP end-of-central-directory not found)')

  const count = view.readUInt16LE(eocd + 10)
  let ptr = view.readUInt32LE(eocd + 16)
  const entries = new Map<string, Buffer>()

  for (let n = 0; n < count; n++) {
    if (ptr + 46 > view.length || view.readUInt32LE(ptr) !== 0x02014b50) break
    const method = view.readUInt16LE(ptr + 10)
    const compSize = view.readUInt32LE(ptr + 20)
    const nameLen = view.readUInt16LE(ptr + 28)
    const extraLen = view.readUInt16LE(ptr + 30)
    const commentLen = view.readUInt16LE(ptr + 32)
    const localOff = view.readUInt32LE(ptr + 42)
    const name = view.slice(ptr + 46, ptr + 46 + nameLen).toString('utf8')
    ptr += 46 + nameLen + extraLen + commentLen

    if (name.endsWith('/')) continue // directory placeholder
    if (view.readUInt32LE(localOff) !== 0x04034b50) throw new Error(`corrupt ZIP entry: ${name}`)
    const lNameLen = view.readUInt16LE(localOff + 26)
    const lExtraLen = view.readUInt16LE(localOff + 28)
    const start = localOff + 30 + lNameLen + lExtraLen
    const raw = view.slice(start, start + compSize)

    let data: Buffer
    if (method === 0) data = Buffer.from(raw)
    else if (method === 8) data = inflateRawSync(raw)
    else throw new Error(`unsupported ZIP compression method ${method} (entry ${name})`)
    entries.set(name, data)
  }

  if (entries.size === 0) throw new Error('not a valid .xlsx workbook (no ZIP entries)')
  return entries
}

// ─────────────────────────── XML helpers ───────────────────────────

function decodeXml(s: string): string {
  return s.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, g: string) => {
    switch (g) {
      case 'amp': return '&'
      case 'lt': return '<'
      case 'gt': return '>'
      case 'quot': return '"'
      case 'apos': return "'"
    }
    if (g[0] === '#') {
      const code = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10)
      if (Number.isFinite(code) && code >= 0 && code <= 0x10ffff) return String.fromCodePoint(code)
    }
    return m
  })
}

function toInt(s: string | undefined): number | null {
  if (!s) return null
  const n = Number.parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

/** "A" → 0, "Z" → 25, "AA" → 26 … */
function colLettersToIndex(letters: string): number {
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** 9.19E11 → "919000000000" (Excel occasionally stores big numbers in E-notation). */
function sciToPlain(s: string): string {
  const n = Number(s)
  return Number.isFinite(n) ? String(n) : s
}

// ─────────────────────────── workbook parts ───────────────────────────

function readSharedStrings(entries: Map<string, Buffer>): string[] {
  const xml = entries.get('xl/sharedStrings.xml')?.toString('utf8')
  if (!xml) return []
  const out: string[] = []
  for (const si of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)) {
    const body = si[1] ?? ''
    let text = ''
    for (const t of body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)) text += decodeXml(t[1] ?? '')
    out.push(text)
  }
  return out
}

function normalizeSheetPath(target: string): string | null {
  const clean = target.split('?')[0].split('#')[0].replace(/^\//, '')
  if (!clean || !clean.endsWith('.xml')) return null
  if (clean.startsWith('xl/')) return clean
  return `xl/${clean}`
}

function pickFirstSheetPath(entries: Map<string, Buffer>): string | null {
  const wb = entries.get('xl/workbook.xml')?.toString('utf8')
  if (wb) {
    const rels = new Map<string, string>()
    const relsXml = entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? ''
    for (const tag of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
      const id = /\bId="([^"]+)"/.exec(tag[0])?.[1]
      const target = /\bTarget="([^"]+)"/.exec(tag[0])?.[1]
      if (id && target) rels.set(id, target)
    }
    const sheetTag = /<sheet\b[^>]*>/.exec(wb)?.[0] ?? ''
    const rid = /\br:id="([^"]+)"/.exec(sheetTag)?.[1]
    let target = rid ? rels.get(rid) : undefined
    if (!target) {
      for (const t of rels.values()) {
        if (/worksheets?\//i.test(t)) {
          target = t
          break
        }
      }
    }
    const path = target ? normalizeSheetPath(target) : null
    if (path && entries.has(path)) return path
  }
  if (entries.has('xl/worksheets/sheet1.xml')) return 'xl/worksheets/sheet1.xml'
  for (const key of entries.keys()) {
    if (/^xl\/worksheets\/[^/]+\.xml$/.test(key)) return key
  }
  return null
}

function cellValue(cAttrs: string, cBody: string, shared: string[]): string {
  const t = /\bt="(\w+)"/.exec(cAttrs)?.[1] ?? ''

  if (t === 'inlineStr') {
    let s = ''
    for (const m of cBody.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) s += decodeXml(m[1])
    return s
  }

  const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cBody)?.[1]
  if (raw === undefined) return ''

  if (t === 's') {
    const idx = toInt(raw.trim())
    return idx !== null && idx >= 0 && idx < shared.length ? (shared[idx] ?? '') : ''
  }
  if (t === 'b') return raw.trim() === '1' ? 'TRUE' : 'FALSE'

  const dec = decodeXml(raw).trim()
  if (/^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/.test(dec)) return sciToPlain(dec)
  return dec
}

function parseWorksheetXml(xml: string, shared: string[]): string[][] {
  const raw: (string[] | undefined)[] = []
  for (const rowM of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const attrs = rowM[1] ?? ''
    const body = rowM[2] ?? ''
    const rowNum = toInt(/\br="(\d+)"/.exec(attrs)?.[1]) ?? raw.length + 1
    const line: string[] = []
    let seq = 0
    for (const cM of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const cAttrs = cM[1] ?? ''
      const ref = /\br="([A-Za-z]+)\d+"/.exec(cAttrs)?.[1]
      const col = ref ? colLettersToIndex(ref.toUpperCase()) : seq
      seq = col + 1
      line[col] = cellValue(cAttrs, cM[2] ?? '', shared)
    }
    raw[rowNum - 1] = line
  }

  return raw.map((row) => Array.from({ length: row?.length ?? 0 }, (_, i) => row?.[i] ?? ''))
}

// ─────────────────────────── public API ───────────────────────────

/** Parse .xlsx bytes into a string grid (rows × columns, all cells strings). */
export function readXlsxGrid(buf: Uint8Array): string[][] {
  const entries = unzipEntries(buf)
  const shared = readSharedStrings(entries)
  const sheetPath = pickFirstSheetPath(entries)
  if (!sheetPath) throw new Error('workbook contains no readable worksheets')
  const xml = entries.get(sheetPath)?.toString('utf8') ?? ''
  return parseWorksheetXml(xml, shared)
}
