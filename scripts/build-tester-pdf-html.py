#!/usr/bin/env python3
"""
SeatServe — build the Tester QR Sticker Kit HTML (multi-page A4).

Page 1        : cover — famous-theatre-style auditorium map (10x10 per side,
                aisle after seat 5, curved screen), mounting rule, the
                LOGICAL CHECK (sit B-1 -> sticker in front on A-1's back
                opens B-1), how scanning auto-sets the seat for the kitchen.
Pages 2..N    : sticker sheets, 16 stickers per page (4x4), dashed cut lines.
                Each sticker: big seat code, QR (unique per seat), and the
                exact mounting instruction. Row A mounts on the front wall;
                rows B-J mount on the seat-back in front — the QR always
                opens the seat it SERVES (the one behind the mounting spot).

Bypass route rules (briefs/creative-fixed-canvas.md):
  - @page 794px 1123px margin:0, .page fixed, no overflow:hidden anywhere
  - @media screen auto-scale, decorative elements contained (<=100%, no neg offsets)
  - <=5 colors, all traceable; Google Fonts link with generic fallback
  - QR <img> via RELATIVE paths (download/tester-qr/qr/<code>.png)
"""
import json
from pathlib import Path

ROOT = Path('/home/z/my-project')
MANIFEST = ROOT / 'scripts' / 'tester-hall-manifest.json'
OUT = ROOT / 'download' / 'SeatServe-Tester-QR-Stickers.html'

ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
COLS = 10
PER_PAGE = 20  # 5 x 4 — 100 stickers fit exactly on 5 sheets, no orphan page

manifest = json.loads(MANIFEST.read_text())

# ── sticker cells ────────────────────────────────────────────────────────
def sticker(code: str) -> str:
    row, num = code.split('-')
    n = int(num)
    if row == 'A':
        mount = f'Mount: front wall / rail, in front of A-{n}'
        mount_short = 'FRONT WALL'
    else:
        prev = ROWS[ROWS.index(row) - 1]
        mount = f'Mount: on the BACK of seat {prev}-{n} — serves {row}-{n} behind it'
        mount_short = f'BACK OF {prev}-{n}'
    return f'''
      <div class="sticker">
        <p class="s-venue">AURORA MALL · TESTER HALL</p>
        <p class="s-seat">{code}</p>
        <img class="s-qr" src="tester-qr/qr/{code}.png" alt="QR for seat {code}" />
        <p class="s-mount"><span>MOUNT ON: {mount_short}</span><br/>Opens Seat {code} · scan auto-sets your seat</p>
      </div>'''

cells = [sticker(f'{r}-{n}') for r in ROWS for n in range(1, COLS + 1)]
pages_of_stickers = [cells[i:i + PER_PAGE] for i in range(0, len(cells), PER_PAGE)]
total_pages = 1 + len(pages_of_stickers)

# ── auditorium map (page 1) ─────────────────────────────────────────────
def seat_tile(row: str, n: int) -> str:
    code = f'{row}-{n}'
    cls = 'seat'
    if row == 'A' and n == 1:
        cls += ' seat-mount'   # mounting position (back of A-1)
    if row == 'B' and n == 1:
        cls += ' seat-you'     # your seat in the example
    return f'<span class="{cls}" title="{code}"></span>'

map_rows = []
for ri, row in enumerate(ROWS):
    tiles = ''.join(seat_tile(row, n) for n in range(1, COLS + 1))
    aisle = '<span class="aisle"></span>' * 1
    left = ''.join(seat_tile(row, n) for n in range(1, 6))
    right = ''.join(seat_tile(row, n) for n in range(6, COLS + 1))
    map_rows.append(f'<div class="map-row"><span class="row-label">{row}</span>{left}{aisle}{right}</div>')

MAP = '\n'.join(map_rows)

HTML = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>SeatServe — Tester QR Sticker Kit (Tester Hall · 100 seats)</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap" rel="stylesheet"/>
<style>
  @page {{ size: 794px 1123px; margin: 0; }}
  html, body {{ margin: 0; padding: 0; width: 794px; background: #FAF8F5; }}
  * {{ box-sizing: border-box; }}
  body {{ font-family: 'Inter', 'Liberation Sans', sans-serif; color: #1A1A1A; }}
  .page {{ width: 794px; height: 1123px; position: relative; background: #FAF8F5; padding: 26px; page-break-after: always; }}
  .page:last-child {{ page-break-after: auto; }}

  /* ── palette (5): bg #FAF8F5 · ink #1A1A1A · gold #D4AF37 · deep gold #8a6d1f · muted #6F6F6F ── */

  /* page 1 — cover */
  .kicker {{ font-size: 11px; font-weight: 700; letter-spacing: .22em; color: #8a6d1f; }}
  h1 {{ margin: 6px 0 2px; font-size: 30px; font-weight: 900; letter-spacing: -0.01em; }}
  .venue {{ font-size: 12.5px; color: #6F6F6F; font-weight: 600; }}
  .layout {{ display: flex; gap: 22px; margin-top: 16px; }}
  .map {{ width: 356px; background: #FFFFFF; border: 1.5px solid #D4AF37; border-radius: 14px; padding: 14px 12px 10px; }}
  .screen {{ height: 34px; margin: 0 8px 12px; border: 2px solid #1A1A1A; border-bottom: none;
            border-radius: 130px 130px 0 0 / 44px 44px 0 0; display: grid; place-items: center;
            font-size: 9.5px; font-weight: 900; letter-spacing: .34em; color: #1A1A1A; }}
  .map-row {{ display: flex; align-items: center; justify-content: center; gap: 3px; margin-bottom: 3px; }}
  .row-label {{ width: 12px; font-size: 8.5px; font-weight: 700; color: #6F6F6F; }}
  .seat {{ width: 22px; height: 17px; border-radius: 4px; background: #EFEAE0; border: 1px solid #D8D3C8; flex: 0 0 auto; }}
  .aisle {{ width: 12px; flex: 0 0 auto; }}
  .seat-mount {{ background: #FFFFFF; border: 1.6px dashed #8a6d1f; }}
  .seat-you {{ background: #D4AF37; border: 1.6px solid #8a6d1f; }}
  .map-note {{ margin-top: 10px; font-size: 9.5px; color: #6F6F6F; line-height: 1.55; }}
  .map-note b {{ color: #1A1A1A; }}
  .chip {{ display: inline-block; width: 10px; height: 8px; border-radius: 2px; vertical-align: -1px; }}

  .right {{ flex: 1; display: flex; flex-direction: column; gap: 12px; }}
  .panel {{ background: #FFFFFF; border: 1.5px solid #D8D3C8; border-radius: 14px; padding: 14px 16px; }}
  .panel h2 {{ margin: 0 0 8px; font-size: 13px; font-weight: 900; letter-spacing: .12em; color: #8a6d1f; }}
  .step {{ display: flex; gap: 10px; margin-bottom: 9px; }}
  .step:last-child {{ margin-bottom: 0; }}
  .step-num {{ width: 20px; height: 20px; border-radius: 50%; background: #D4AF37; color: #1A1A1A;
               font-size: 11px; font-weight: 900; display: grid; place-items: center; flex: 0 0 auto; }}
  .step p {{ margin: 1px 0 0; font-size: 11.5px; line-height: 1.55; color: #1A1A1A; }}
  .step p span {{ color: #6F6F6F; }}

  .check {{ background: #1A1A1A; color: #FAF8F5; border-radius: 14px; padding: 15px 16px; }}
  .check h2 {{ margin: 0 0 7px; font-size: 13px; font-weight: 900; letter-spacing: .12em; color: #D4AF37; }}
  .check p {{ margin: 0 0 7px; font-size: 11.5px; line-height: 1.6; }}
  .check b {{ color: #D4AF37; }}
  .rule {{ border-top: 1px dashed rgba(250,248,245,.35); padding-top: 8px; font-size: 11.5px; line-height: 1.6; }}

  .foot {{ position: absolute; left: 26px; right: 26px; bottom: 20px; display: flex; justify-content: space-between;
           font-size: 9px; font-weight: 700; letter-spacing: .14em; color: #6F6F6F; }}

  /* sticker sheets */
  .sheet-head {{ display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }}
  .sheet-head .t {{ font-size: 14px; font-weight: 900; letter-spacing: .02em; }}
  .sheet-head .t span {{ color: #8a6d1f; }}
  .sheet-head .p {{ font-size: 10px; font-weight: 700; color: #6F6F6F; letter-spacing: .1em; }}
  .grid {{ display: flex; flex-wrap: wrap; gap: 11px; }}
  .sticker {{ width: 138px; height: 234px; border: 1.6px dashed #B8B2A6; border-radius: 10px;
              background: #FFFFFF; padding: 9px 8px 8px; text-align: center;
              display: flex; flex-direction: column; align-items: center; }}
  .s-venue {{ margin: 0; font-size: 7.2px; font-weight: 700; letter-spacing: .16em; color: #6F6F6F; }}
  .s-seat {{ margin: 2px 0 4px; font-size: 26px; font-weight: 900; letter-spacing: .02em; color: #1A1A1A; }}
  .s-qr {{ width: 104px; height: 104px; image-rendering: pixelated; }}
  .s-mount {{ margin: 6px 0 0; font-size: 8px; line-height: 1.5; color: #6F6F6F; font-weight: 600; }}
  .s-mount span {{ color: #8a6d1f; font-weight: 900; letter-spacing: .05em; }}
  .sheet-foot {{ position: absolute; left: 26px; right: 26px; bottom: 18px; text-align: center;
                 font-size: 8.6px; font-weight: 700; letter-spacing: .12em; color: #6F6F6F; }}

  /* page 1 — anatomy + kitchen strip */
  .labs {{ display: flex; gap: 22px; margin-top: 18px; }}
  .labs .panel {{ flex: 1; }}
  .anat {{ display: flex; gap: 16px; align-items: flex-start; }}
  .anat .sticker {{ width: 150px; height: auto; flex: 0 0 auto; }}
  .anat .sticker .s-qr {{ width: 96px; height: 96px; }}
  .anat ul {{ margin: 4px 0 0; padding: 0 0 0 2px; list-style: none; }}
  .anat li {{ font-size: 10.5px; line-height: 1.55; color: #1A1A1A; margin-bottom: 7px; }}
  .anat li b {{ color: #8a6d1f; }}
  .kds {{ font-family: 'Liberation Mono', 'DejaVu Sans Mono', monospace; font-size: 11px; line-height: 1.7;
          background: #FFFFFF; border: 1.5px dashed #B8B2A6; border-radius: 10px; padding: 12px 14px; color: #1A1A1A; }}
  .kds .hd {{ font-weight: 900; letter-spacing: .1em; }}
  .kds .kseat {{ display: inline-block; margin-top: 4px; background: #D4AF37; border-radius: 5px;
                 padding: 2px 8px; font-weight: 900; font-size: 12.5px; white-space: nowrap; }}
  .kds-note {{ margin: 9px 0 0; font-size: 10.5px; line-height: 1.55; color: #6F6F6F; }}
  .kds-note b {{ color: #1A1A1A; }}

  @media screen {{
    html {{ height: auto; display: flex; justify-content: center; background: #FAF8F5; }}
    body {{ transform-origin: top center; scale: min(1, calc(100vw / 794)); margin: 0 auto; }}
  }}
</style>
</head>
<body>

<!-- ── PAGE 1 · cover & instructions ── -->
<div class="page">
  <p class="kicker">SEATSERVE · FIELD-TEST KIT</p>
  <h1>Tester QR Sticker Kit — Tester Hall</h1>
  <p class="venue">Aurora Mall, Mumbai · Aurora Cineplex — Wing A · 10 rows × 10 seats per side (A–J × 1–10) · 100 unique stickers</p>

  <div class="layout">
    <div class="map">
      <div class="screen">SCREEN — THIS WAY</div>
      {MAP}
      <p class="map-note">
        <span class="chip" style="background:#D4AF37;border:1px solid #8a6d1f;"></span> <b>You</b> — example: sitting at <b>B-1</b> (row 2, seat 1)<br/>
        <span class="chip" style="background:#fff;border:1.6px dashed #8a6d1f;"></span> <b>Sticker spot</b> — B-1's sticker, stuck on the back of A-1
      </p>
    </div>

    <div class="right">
      <div class="panel">
        <h2>HOW A TESTER SCANS</h2>
        <div class="step"><span class="step-num">1</span><p>Peel the sticker for the seat and stick it where the mount line says — seat-back in front (or front wall for row A).</p></div>
        <div class="step"><span class="step-num">2</span><p>Tester scans the QR with their phone camera. The web opens and <b>the seat sets itself automatically</b> — no typing, no seat picker.</p></div>
        <div class="step"><span class="step-num">3</span><p>They order and pay. The store kitchen ticket and the runner screen show <b>the exact seat number</b>, so the cook knows where it goes.</p></div>
      </div>

      <div class="check">
        <h2>THE LOGICAL CHECK</h2>
        <p>Hall is 10 × 10 on one side. Tester sits in the <b>2nd row, 1st seat</b> — that is <b>B-1</b>. The sticker <b>in front of them</b> is stuck on the back of A-1.</p>
        <p>They scan it → the app shows <b>Seat B-1</b> — <b>their own seat number</b>, not A-1.</p>
        <p class="rule"><b>THE RULE:</b> every sticker serves the seat <b>BEHIND</b> its mounting spot. Row A has nobody in front — its stickers go on the front wall and serve their own seat.</p>
      </div>
    </div>
  </div>

  <div class="labs">
    <div class="panel">
      <h2>STICKER ANATOMY</h2>
      <div class="anat">
        <div class="sticker">
          <p class="s-venue">AURORA MALL · TESTER HALL</p>
          <p class="s-seat">B-1</p>
          <img class="s-qr" src="tester-qr/qr/B-1.png" alt="QR for seat B-1"/>
          <p class="s-mount"><span>MOUNT ON: BACK OF A-1</span><br/>Opens Seat B-1 · scan auto-sets your seat</p>
        </div>
        <ul>
          <li><b>BIG CODE</b> — the seat this sticker OPENS (the seat behind the mounting spot).</li>
          <li><b>QR</b> — unique 10-character seat token. Exists only on this printout, never inside the web app.</li>
          <li><b>MOUNT LINE</b> — exactly where the sticker sticks. Row A: front wall. Rows B–J: seat-back in front.</li>
        </ul>
      </div>
    </div>
    <div class="panel">
      <h2>WHAT THE KITCHEN SEES</h2>
      <div class="kds">
        <div class="hd">🍿 CINEMA SNACKS · NEW ORDER</div>
        TKT-7G2KQM · just now<br/>
        Masala Chai × 1 — ₹80<br/>
        <span class="kseat">SEAT B-1 · TESTER HALL</span>
      </div>
      <p class="kds-note">The store kitchen ticket and the runner's delivery screen both carry <b>the exact scanned seat number</b> — the cook never has to ask where the order goes.</p>
    </div>
  </div>

  <div class="foot">
    <span>QRs ARE UNIQUE PER SEAT — PRINT ONLY, NEVER SHOWN INSIDE THE WEB APP</span>
    <span>{total_pages} PAGES · 100 STICKERS</span>
  </div>
</div>

<!-- ── STICKER SHEETS ── -->
'''

for pi, chunk in enumerate(pages_of_stickers, start=2):
    HTML += f'''
<div class="page">
  <div class="sheet-head">
    <p class="t">Tester Hall sticker sheet <span>· rows A–J × seats 1–10</span></p>
    <p class="p">SHEET {pi - 1} / {len(pages_of_stickers)}</p>
  </div>
  <div class="grid">{''.join(chunk)}
  </div>
  <p class="sheet-foot">CUT ON DASHED LINES · EVERY QR IS UNIQUE · SCANNING AUTO-SETS THE SEAT ON THE WEB</p>
</div>'''

HTML += '\n</body>\n</html>\n'
OUT.write_text(HTML)
print(f'✅ wrote {OUT} — {total_pages} pages, {len(cells)} stickers')
