// Task 37 — seed the COLLEGE DEMO on live prod (notifetch.in) using the new
// self-serve onboarding API (dogfoods the exact flow a real college will use):
//   Nova Degree College · Science Block · 10 classrooms (door QR each)
//   · Campus Canteen (KYC PENDING) · rolling 'Break' lecture per room
// Then: login as the new BLOCK_MANAGER and load a 6-item canteen menu
// (reusing the shipped /menu/*.jpg photos), and print all access links.
// Idempotent: scripts/campus-demo.json remembers the first run.
import { writeFileSync, existsSync, readFileSync } from 'node:fs'

const BASE = process.env.SEED_BASE ?? 'https://notifetch.in'
const STATE_FILE = new URL('./campus-demo.json', import.meta.url)

const MENU = [
  { name: 'Samosa (2 pcs)', description: 'Crispy punjabi samosa with chutney', category: 'Snacks', pricePaise: 2000, prepEstimateMin: 5, isVeg: true, imageUrl: '/menu/samosa.jpg' },
  { name: 'Masala Chai', description: 'Hot cutting chai, brewed fresh', category: 'Hot Drinks', pricePaise: 1500, prepEstimateMin: 4, isVeg: true, imageUrl: '/menu/masala-chai.jpg' },
  { name: 'Filter Coffee', description: 'Strong south-Indian filter coffee', category: 'Hot Drinks', pricePaise: 2000, prepEstimateMin: 4, isVeg: true, imageUrl: '/menu/filter-coffee.jpg' },
  { name: 'Veg Momo (6 pcs)', description: 'Steamed veg momos with fiery red chutney', category: 'Snacks', pricePaise: 4000, prepEstimateMin: 8, isVeg: true, imageUrl: '/menu/momo.jpg' },
  { name: 'Peri Peri Fries', description: 'Crispy fries tossed in peri peri masala', category: 'Snacks', pricePaise: 3500, prepEstimateMin: 6, isVeg: true, imageUrl: '/menu/peri-peri-fries.jpg' },
  { name: 'Cold Coffee', description: 'Chilled frothy cold coffee', category: 'Cold Drinks', pricePaise: 3000, prepEstimateMin: 5, isVeg: true, imageUrl: '/menu/cold-coffee.jpg' },
]

let cookie = ''
async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const kv = c.split(';')[0]
    if (kv.startsWith('ss_session=')) cookie = kv
  }
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: res.status, json, text }
}
const log = (step, status, json) =>
  console.log(`[${status}] ${step} ${json ? JSON.stringify(json).slice(0, 200) : ''}`)

const CREDS = { email: 'manager@nova.demo', password: 'campus-demo123' }

async function main() {
  let state
  if (existsSync(STATE_FILE)) {
    state = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    console.log('campus demo already onboarded — reusing stored ids')
  } else {
    // 1. onboard via the PUBLIC wizard API (dogfood!)
    const r1 = await call('POST', '/api/onboard/campus', {
      campusName: 'Nova Degree College',
      city: 'Bengaluru',
      blockName: 'Science Block',
      classrooms: 10,
      seatRows: 6,
      seatCols: 6,
      storeName: 'Campus Canteen',
      adminName: 'Prof. Rao',
      adminEmail: CREDS.email,
      adminPhone: '9900000010',
      password: CREDS.password,
    })
    log('onboard campus', r1.status, r1.json?.data ? { blockId: r1.json.data.blockId, rooms: r1.json.data.classrooms?.length } : r1.json)
    if (r1.status !== 201) process.exit(1)
    state = {
      ...r1.json.data,
      managerEmail: CREDS.email,
      managerPassword: CREDS.password,
    }
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
  }

  // 2. login as the block manager and load the canteen menu
  const r2 = await call('POST', '/api/auth/login', { email: state.managerEmail, password: state.managerPassword })
  log('login manager', r2.status, r2.json?.data ? { role: r2.json.data.role } : r2.json)
  if (r2.status !== 200) process.exit(1)

  const existing = await call('GET', `/api/store/menu?storeId=${state.storeId}`)
  const have = new Set((existing.json?.data?.products ?? []).map((p) => p.name))
  for (const item of MENU) {
    if (have.has(item.name)) continue
    const r = await call('POST', '/api/store/products', { storeId: state.storeId, ...item })
    if (r.status !== 201 && r.status !== 200) log(`menu ${item.name}`, r.status, r.json)
  }
  console.log(`menu: ensured ${MENU.length} items`)

  const firstRoom = state.classrooms[0]
  console.log('\n=== COLLEGE DEMO LIVE ===')
  console.log(`campus: ${state.campusName} · ${state.blockName} (${state.classrooms.length} rooms)`)
  console.log(`student order URL (Room ${firstRoom.name}): ${BASE}/?qr=${firstRoom.doorQrToken}`)
  console.log(`sticker sheet (print A4): ${BASE}/onboard/print?blockId=${state.blockId}`)
  console.log(`manager portal: ${BASE}/staff · ${state.managerEmail} / ${state.managerPassword}`)
  console.log(`store: ${state.storeId} · KYC PENDING (verify via admin board for live payments)`)
}

main()
