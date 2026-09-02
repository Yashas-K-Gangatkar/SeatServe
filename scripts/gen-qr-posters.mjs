/**
 * NotiFetch — Seat QR sticker posters (Task 25-b).
 * Reads scripts/qr-seed.json (live seat tokens fetched from prod) and emits:
 *   download/notifetch-seat-qr-posters.html  (+ same-name PDF via html2pdf-next.js)
 *
 * Layout: A4 portrait, cover + 20 stickers/page (4×5), dashed cut lines,
 * each QR encodes https://notifetch.in/?qr=<seatToken> at ~500dpi print size.
 * Run: node scripts/gen-qr-posters.mjs
 */
import QRCode from 'qrcode'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const seed = JSON.parse(readFileSync(join(here, 'qr-seed.json'), 'utf8'))
const outDir = join(here, '..', 'download')
mkdirSync(outDir, { recursive: true })

const BASE = 'https://notifetch.in'
const COLS = 4
const ROWS = 5
const PER_PAGE = COLS * ROWS

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// chunk seats into pages
const pagesOf = (seats) => {
  const pages = []
  for (let i = 0; i < seats.length; i += PER_PAGE) pages.push(seats.slice(i, i + PER_PAGE))
  return pages
}

// pre-render every seat QR as a 600px data URL (~500dpi at 30mm print)
let rendered = 0
for (const scr of seed) {
  for (const seat of scr.seats) {
    seat.url = `${BASE}/?qr=${seat.qrToken}`
    seat.qr = await QRCode.toDataURL(seat.url, {
      width: 600,
      margin: 1,
      color: { dark: '#1A1A1A', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    })
    rendered++
  }
}
console.log(`QRs rendered: ${rendered}`)

// ── build page list ──────────────────────────────────────────────
const screenPages = []
let totalPages = 1 // cover
for (const scr of seed) {
  const pages = pagesOf(scr.seats)
  pages.forEach((seats, i) => {
    screenPages.push({ scr, seats, part: i + 1, partTotal: pages.length, pageNo: ++totalPages })
  })
}

// ── cover page ───────────────────────────────────────────────────
const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const sample = seed[0].seats[0]
const indexRows = []
{
  let pageNo = 2
  for (const scr of seed) {
    const n = Math.ceil(scr.seats.length / PER_PAGE)
    const range = n === 1 ? `${pageNo}` : `${pageNo}–${pageNo + n - 1}`
    const wing = scr.cinema.includes('Wing B') ? 'Wing B' : scr.cinema.includes('Wing A') ? 'Wing A' : '—'
    indexRows.push(`<tr><td class="scr">${esc(scr.screen)}</td><td>${wing}</td><td class="num">${scr.seats.length}</td><td class="num">${range}</td></tr>`)
    pageNo += n
  }
}

const coverHTML = `
<section class="page cover">
  <div class="brand-row">
    <span class="brand">NotiFetch</span>
    <span class="brand-tag">order food to your cinema seat</span>
  </div>
  <h1>Seat QR<br/>Stickers</h1>
  <p class="lede">Print this file at <b>100% scale on A4</b>, cut along the dashed lines,
  and stick one card on each seat back. When a customer scans their seat with any
  phone camera, the menu for <b>that exact seat</b> opens — they order and pay by UPI
  in one flow, and the runner delivers to the seat.</p>

  <div class="cover-grid">
    <div class="how">
      <ol class="steps">
        <li><b>Print</b><span>A4, portrait, 100% scale (no “fit to page”).</span></li>
        <li><b>Cut</b><span>Follow the dashed lines — 20 cards per sheet.</span></li>
        <li><b>Stick</b><span>One card per seat, matching the code on the card.</span></li>
      </ol>
      <div class="flow">
        <span class="chip">Scan</span><span class="arr">→</span>
        <span class="chip">Seat menu opens</span><span class="arr">→</span>
        <span class="chip">Order + UPI</span><span class="arr">→</span>
        <span class="chip">Delivered to seat</span>
      </div>
      <table class="index">
        <thead><tr><th>Screen</th><th>Wing</th><th class="r">Stickers</th><th class="r">Pages</th></tr></thead>
        <tbody>${indexRows.join('')}</tbody>
      </table>
    </div>
    <div class="sample-wrap">
      <p class="sample-title">Every sticker looks like this</p>
      <div class="card sample">
        <img src="${sample.qr}" alt="Sample seat QR code" />
        <p class="seat">${esc(seed[0].screen)} · ${esc(sample.code)}</p>
        <p class="sub">scan to order · notifetch.in</p>
      </div>
      <p class="sample-note">Sticker paper tip: matte A4 sticker sheets (or 65 gsm paper + glue stick) scan best — avoid glossy lamination directly over the code.</p>
    </div>
  </div>

  <footer class="cover-foot">
    <span>${rendered} stickers · ${seed.length} screens · Aurora Cineplex</span>
    <span>notifetch.in · generated ${today}</span>
  </footer>
</section>`

// ── sticker pages ────────────────────────────────────────────────
const stickerPages = screenPages.map(({ scr, seats, part, partTotal, pageNo }) => {
  const cards = seats
    .map(
      (s) => `<div class="card">
        <img src="${s.qr}" alt="QR for seat ${esc(s.code)}" />
        <p class="seat">${esc(scr.screen)} · ${esc(s.code)}</p>
        <p class="sub">scan to order · notifetch.in</p>
      </div>`,
    )
    .join('\n')
  return `
<section class="page">
  <header class="page-head">
    <div>
      <p class="kicker">${esc(scr.cinema)}</p>
      <h2>${esc(scr.screen)} <span class="part">· sheet ${part}/${partTotal}</span></h2>
    </div>
    <p class="pg">${pageNo} / ${totalPages}</p>
  </header>
  <div class="grid">
${cards}
  </div>
</section>`
})

// ── document ─────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>NotiFetch — Seat QR Stickers (Aurora Cineplex)</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
<style>
  @page { size: 210mm 297mm; margin: 0; }
  :root {
    --bg: #f7f4ef;
    --ink: #1c1917;
    --muted: #78716c;
    --accent: #c2410c;
    --accent-soft: #b45309;
    --line: #d8d1c3;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); }
  body {
    font-family: 'Inter', 'Liberation Sans', Arial, sans-serif;
    color: var(--ink);
    line-break: strict;
  }
  p, td, li { overflow-wrap: break-word; }

  .page {
    width: 210mm;
    height: 296.7mm;
    padding: 11mm;
    background: var(--bg);
    page-break-after: always;
    break-after: page;
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }

  /* cover */
  .cover { padding: 14mm 14mm 11mm; }
  .brand-row { display: flex; align-items: baseline; gap: 4mm; }
  .brand { font-weight: 900; font-size: 20pt; letter-spacing: -0.02em; color: var(--accent); }
  .brand-tag { font-size: 10pt; color: var(--muted); font-weight: 400; }
  .cover h1 {
    margin: 8mm 0 5mm;
    font-size: 46pt; line-height: 0.95; font-weight: 900; letter-spacing: -0.03em;
  }
  .lede { margin: 0; max-width: 172mm; font-size: 11.5pt; line-height: 1.5; color: #44403c; }
  .cover-grid { display: flex; gap: 10mm; margin-top: 9mm; flex: 1; min-height: 0; }
  .how { flex: 1.35; min-width: 0; }
  .sample-wrap { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; }

  .steps { list-style: none; margin: 0 0 6mm; padding: 0; counter-reset: step; }
  .steps li {
    counter-increment: step; display: flex; align-items: baseline; gap: 4mm;
    padding: 2.6mm 0; border-bottom: 0.4mm solid var(--line);
  }
  .steps li::before {
    content: counter(step);
    flex: 0 0 auto; width: 9mm; height: 9mm; border-radius: 50%;
    background: var(--accent); color: #fff; font-weight: 900; font-size: 12pt;
    display: flex; align-items: center; justify-content: center;
    transform: translateY(1.2mm);
  }
  .steps b { font-size: 13pt; }
  .steps span { font-size: 10pt; color: var(--muted); }

  .flow { display: flex; flex-wrap: wrap; align-items: center; gap: 2.5mm; margin: 0 0 7mm; max-width: 100%; }
  .chip {
    flex: 0 1 auto; min-width: 0; background: #fff; border: 0.4mm solid var(--line);
    border-radius: 6mm; padding: 2mm 4mm; font-size: 10pt; font-weight: 700;
  }
  .arr { color: var(--accent-soft); font-weight: 900; flex-shrink: 0; }

  table.index { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  table.index th {
    text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.14em;
    color: var(--muted); padding: 0 0 1.6mm; border-bottom: 0.6mm solid var(--ink);
  }
  table.index th.r { text-align: right; }
  table.index td { padding: 2.2mm 0; border-bottom: 0.3mm solid var(--line); white-space: nowrap; }
  table.index td.scr { font-weight: 700; }
  table.index td.num { text-align: right; font-variant-numeric: tabular-nums; color: #44403c; }

  .sample-title { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.16em; color: var(--muted); font-weight: 700; margin: 0 0 5mm; }
  .sample { width: 64mm; }
  .sample img { width: 46mm; height: 46mm; }
  .sample-note { margin-top: 6mm; font-size: 9pt; line-height: 1.5; color: var(--muted); max-width: 66mm; text-align: center; }

  .cover-foot {
    display: flex; justify-content: space-between; gap: 6mm;
    border-top: 0.5mm solid var(--line); padding-top: 4mm;
    font-size: 9pt; color: var(--muted);
  }

  /* sticker pages */
  .page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 6mm; margin-bottom: 5mm; }
  .kicker { margin: 0; font-size: 8.5pt; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent-soft); }
  .page-head h2 { margin: 1mm 0 0; font-size: 17pt; font-weight: 900; letter-spacing: -0.01em; }
  .page-head .part { font-size: 11pt; font-weight: 700; color: var(--muted); }
  .page-head .pg { font-size: 9pt; color: var(--muted); font-variant-numeric: tabular-nums; }

  .grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(${COLS}, 1fr);
    grid-template-rows: repeat(${ROWS}, 1fr);
    gap: 2.6mm;
    max-width: 100%;
  }
  .card {
    background: #ffffff;
    border: 0.4mm dashed #c9c0ae;
    border-radius: 2.4mm;
    padding: 2.6mm 2mm 2mm;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    min-width: 0; min-height: 0;
  }
  .card img { width: 29mm; height: 29mm; display: block; }
  .card .seat {
    margin: 1.6mm 0 0; font-size: 10.5pt; font-weight: 900; text-align: center;
    letter-spacing: -0.01em; max-width: 100%;
  }
  .card .sub {
    margin: 0.6mm 0 0; font-size: 7.5pt; color: var(--muted); text-align: center; max-width: 100%;
  }

  @media screen {
    html { background: #e8e4dc; }
    body { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 16px; zoom: 0.75; }
    .page { box-shadow: 0 2px 14px rgba(0,0,0,0.12); }
  }
</style>
</head>
<body>
${coverHTML}
${stickerPages.join('\n')}
</body>
</html>`

const outFile = join(outDir, 'notifetch-seat-qr-posters.html')
writeFileSync(outFile, html)
console.log(`HTML written: ${outFile} (${totalPages} pages)`)
