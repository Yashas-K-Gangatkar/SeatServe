/**
 * SeatServe — generate the 100 tester-hall QR PNGs from the manifest.
 * Each QR encodes the PRODUCTION url: https://ctshop-five.vercel.app/?qr=<token>
 * so a tester's phone camera opens the live demo seat directly.
 *
 * Output: download/tester-qr/qr/<SEAT_CODE>.png  (300px, print-safe)
 * Run:    node scripts/gen-tester-qr-pngs.mjs
 */
import QRCode from 'qrcode'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(join(here, 'tester-hall-manifest.json'), 'utf8'))
const outDir = join(here, '..', 'download', 'tester-qr', 'qr')
mkdirSync(outDir, { recursive: true })

const BASE = process.env.TQR_BASE_URL ?? 'https://ctshop-five.vercel.app'

let n = 0
for (const [code, token] of Object.entries(manifest)) {
  const url = `${BASE}/?qr=${token}`
  await QRCode.toFile(join(outDir, `${code}.png`), url, {
    width: 300,
    margin: 1,
    color: { dark: '#1A1A1A', light: '#FFFFFF' },
    errorCorrectionLevel: 'M',
  })
  n++
}
console.log(`✅ wrote ${n} QR PNGs to ${outDir} (encoding ${BASE}/?qr=<token>)`)
