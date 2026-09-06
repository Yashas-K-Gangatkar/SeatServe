// Builds a real .xlsx roster workbook (raw ZIP+XML, no deps) for the local
// end-to-end test of /api/cron/sheet-sync, plus a CSV twin for parity checks.
// Usage: node scripts/make-roster-fixture.mjs [outDir]
import { deflateRawSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// ── zip writer (stored + deflate) ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function makeZip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const e of entries) {
    const method = e.method ?? 8
    const comp = method === 8 ? deflateRawSync(e.data) : e.data
    const name = Buffer.from(e.name, 'utf8')
    const crc = crc32(e.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(comp.length, 18)
    local.writeUInt32LE(e.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, comp)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(comp.length, 20)
    central.writeUInt32LE(e.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)
    offset += 30 + name.length + comp.length
  }
  const centralBuf = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBuf, eocd])
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const col = (i) => {
  let s = ''
  i += 1
  while (i > 0) {
    s = String.fromCharCode(64 + ((i - 1) % 26) + 1) + s
    i = Math.floor((i - 1) / 26)
  }
  return s
}

function buildXlsx(rows) {
  const nCols = rows[0].length
  const strings = []
  const cell = (value, rowIdx, colIdx) => {
    if (value === '') return ''
    const ref = `${col(colIdx)}${rowIdx + 1}`
    const strIdx = strings.indexOf(value)
    if (strIdx >= 0) return `<c r="${ref}" t="s"><v>${strIdx}</v></c>`
    strings.push(value)
    return `<c r="${ref}" t="s"><v>${strings.length - 1}</v></c>`
  }
  const sheetRows = rows
    .map((r, i) => `<row r="${i + 1}">${Array.from({ length: nCols }, (_, c) => cell(r[c], i, c)).join('')}</row>`)
    .join('')
  const sst = `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings
    .map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`)
    .join('')}</sst>`
  const sheet = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`
  const workbook =
    '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="Staff roster" sheetId="1" r:id="rId1"/></sheets></workbook>'
  const rels =
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
    'Target="worksheets/sheet1.xml"/></Relationships>'
  const contentTypes =
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
    '</Types>'
  const rootRels =
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" ' +
    'Target="xl/workbook.xml"/></Relationships>'
  return makeZip([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes) },
    { name: '_rels/.rels', data: Buffer.from(rootRels) },
    { name: 'xl/workbook.xml', data: Buffer.from(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(rels) },
    { name: 'xl/sharedStrings.xml', data: Buffer.from(sst) },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet) },
  ])
}

// ── roster content (Wrap House exists in the local demo DB) ──
const rows = [
  ['Name', 'Email', 'Role', 'Store', 'Password', 'Active'],
  ['Sheet Test Ravi', 'ssheet.ravi@test.local', 'KITCHEN_STAFF', 'Wrap House', 'TestPass9', 'TRUE'],
  ['Sheet Test Priya', 'ssheet.priya@test.local', 'STORE_MANAGER', 'Wrap House', 'TestPass2', 'TRUE'],
  ['Sheet Test Off', 'ssheet.off@test.local', 'KITCHEN_STAFF', 'Wrap House', 'TestPass3', 'TRUE'],
]

const outDir = process.argv[2] ?? '.tmp-sheetfix'
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'roster.xlsx'), buildXlsx(rows))
writeFileSync(join(outDir, 'roster.csv'), rows.map((r) => r.join(',')).join('\n'))
console.log(`wrote ${outDir}/roster.xlsx (${rows.length - 1} staff rows) + roster.csv`)
