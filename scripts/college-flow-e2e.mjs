#!/usr/bin/env node
// E2E: proves the three founder-critical college flows against a running
// server (default http://localhost:3000, LOCAL SQLite — never prod):
//   1. College gets in        — public onboarding wizard API → campus + door QRs + manager login
//   2. College receives orders— door-QR order → mock-paid → appears on the kitchen board → accepted
//   3. College manages menu   — add items, DELETE item (incl. one with order history)
// Usage: node scripts/college-flow-e2e.mjs [baseUrl]

const BASE = process.argv[2] ?? 'http://localhost:3000'
const STAMP = Date.now()
const ADMIN_EMAIL = `e2e-${STAMP}@college.demo`
const ADMIN_PASSWORD = 'e2epass123'
const ADMIN_PHONE = `9${String(STAMP).slice(-9)}` // unique 10-digit per run (re-runnable)

let cookie = ''
let passed = 0
const failures = []

function check(name, cond, detail = '') {
  if (cond) {
    passed++
    console.log(`  ✅ ${name}`)
  } else {
    failures.push(name)
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const setCookie = res.headers.get('set-cookie')
  let json = null
  try { json = await res.json() } catch { /* non-JSON (should not happen) */ }
  return { status: res.status, json, setCookie }
}

console.log(`\nNotiFetch college-flow E2E → ${BASE}\n`)

// ── 0. server is up ────────────────────────────────────────────────
console.log('0. Server health')
const health = await call('GET', '/api/health')
check('GET /api/health responds 200', health.status === 200, `status=${health.status}`)

// ── 1. college onboards itself ─────────────────────────────────────
console.log('\n1. College gets in — self-serve onboarding')
const onboard = await call('POST', '/api/onboard/campus', {
  campusName: `E2E Degree College ${STAMP}`,
  city: 'Bengaluru',
  blockName: 'Block A',
  classrooms: 2,
  seatRows: 2,
  seatCols: 2,
  storeName: 'E2E Canteen',
  adminName: 'E2E Manager',
  adminEmail: ADMIN_EMAIL,
  adminPhone: ADMIN_PHONE,
  password: ADMIN_PASSWORD,
})
check('POST /api/onboard/campus → 201', onboard.status === 201, `status=${onboard.status} body=${JSON.stringify(onboard.json)}`)
const ob = onboard.json?.data ?? {}
const blockId = ob.blockId
const storeId = ob.storeId
const doorToken = ob.classrooms?.[0]?.doorQrToken
const roomName = ob.classrooms?.[0]?.name
check('campus + block + store + manager created', Boolean(blockId && storeId && doorToken))
check('manager login is the email we chose', ob.manager?.login === ADMIN_EMAIL, JSON.stringify(ob.manager ?? {}))
check('order URL points at the classroom door QR', typeof ob.orderUrl === 'string' && ob.orderUrl.includes(doorToken ?? '‗'))

const stickers = await call('GET', `/api/onboard/qr?blockId=${encodeURIComponent(blockId ?? '')}`)
check('printable door-QR sticker sheet → 200 with 2 rooms', stickers.status === 200 && (stickers.json?.data?.stickers?.length ?? 0) === 2, JSON.stringify(stickers.json?.data?.stickers?.length ?? stickers.json))

// ── 2. manager logs into the staff portal ──────────────────────────
console.log('\n2. Manager logs in')
const login = await call('POST', '/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
check('POST /api/auth/login → 200', login.status === 200, `status=${login.status}`)
cookie = (login.setCookie ?? '').split(';')[0]
check('session cookie issued', cookie.startsWith('ss_session='))

// ── 3. menu: empty → add → list → delete ───────────────────────────
console.log('\n3. Menu add + delete')
const menuEmpty = await call('GET', '/api/store/menu')
check('fresh canteen resolves with EMPTY menu', menuEmpty.status === 200 && (menuEmpty.json?.data?.products?.length ?? -1) === 0 && menuEmpty.json?.data?.store?.name === 'E2E Canteen', JSON.stringify(menuEmpty.json?.data?.store ?? menuEmpty.json))

const addSamosa = await call('POST', '/api/store/products', {
  storeId, name: 'Samosa E2E', category: 'Snacks', pricePaise: 2000,
  prepEstimateMin: 5, isVeg: true, imageUrl: '/menu/samosa.jpg',
})
check('ADD item (samosa ₹20) succeeds', [200, 201].includes(addSamosa.status), `status=${addSamosa.status} ${JSON.stringify(addSamosa.json)}`)
const samosaId = addSamosa.json?.data?.id

const addChai = await call('POST', '/api/store/products', {
  storeId, name: 'Masala Chai E2E', category: 'Beverages', pricePaise: 1500,
  prepEstimateMin: 4, isVeg: true, imageUrl: '/menu/masala-chai.jpg',
})
check('ADD item (chai ₹15) succeeds', [200, 201].includes(addChai.status), `status=${addChai.status} ${JSON.stringify(addChai.json)}`)
const chaiId = addChai.json?.data?.id

const menuTwo = await call('GET', '/api/store/menu')
check('menu now lists 2 items', (menuTwo.json?.data?.products?.length ?? 0) === 2)

const delSamosa = await call('DELETE', `/api/products/${samosaId}`)
check('DELETE samosa → 200', delSamosa.status === 200, `status=${delSamosa.status} ${JSON.stringify(delSamosa.json)}`)
const menuOne = await call('GET', '/api/store/menu')
check('menu back to 1 item after delete', (menuOne.json?.data?.products?.length ?? -1) === 1)
check('remaining item is the chai', menuOne.json?.data?.products?.[0]?.name === 'Masala Chai E2E')

const stranger = await fetch(`${BASE}/api/products/${samosaId}`, { method: 'DELETE' })
check('unauthenticated DELETE is rejected', stranger.status === 401, `status=${stranger.status}`)

// ── 4. student orders via the DOOR QR ──────────────────────────────
console.log('\n4. Student orders (door QR → kitchen)')
const order = await call('POST', '/api/orders', {
  qrToken: doorToken,
  items: [{ productId: chaiId, qty: 1, notes: 'less sugar' }],
  seatLabel: 'A-1',
  customerName: 'E2E Student',
})
check('POST /api/orders with door QR → 201', order.status === 201, `status=${order.status} ${JSON.stringify(order.json)}`)
const orderCode = order.json?.data?.code
check('order anchored to the right room + roll label', order.json?.data?.seat?.classroom === roomName && order.json?.data?.seat?.code === 'A-1', JSON.stringify(order.json?.data?.seat ?? {}))

const pay = await call('POST', '/api/payments/mock-pay', {
  orderCode, method: 'UPI', methodDetail: 'e2e@upi', idempotencyKey: crypto.randomUUID(),
})
check('payment captured → order PAID', pay.status === 200 && pay.json?.data?.orderPaymentStatus === 'PAID', JSON.stringify(pay.json?.data ?? pay.json))

const tickets = await call('GET', `/api/kitchen/tickets?storeId=${storeId}`)
const t0 = tickets.json?.data?.tickets?.[0]
check('kitchen board shows the paid ticket', tickets.status === 200 && tickets.json?.data?.tickets?.length === 1, `status=${tickets.status}`)
check('ticket carries room + roll + note + items', t0?.seat === 'A-1' && t0?.classroom === roomName && t0?.items?.[0]?.notes === 'less sugar', JSON.stringify(t0 ?? {}))

const accept = await call('POST', `/api/kitchen/tickets/${t0?.ticketId}/status`, { to: 'ACCEPTED' })
check('kitchen accepts the ticket (NEW → ACCEPTED)', accept.status === 200, `status=${accept.status} ${JSON.stringify(accept.json)}`)

// ── 5. delete an item that HAS order history (snapshot safety) ─────
console.log('\n5. Delete with order history')
const delChai = await call('DELETE', `/api/products/${chaiId}`)
check('DELETE chai (1 past order) → 200, history kept', delChai.status === 200 && delChai.json?.data?.pastOrders === 1, `status=${delChai.status} ${JSON.stringify(delChai.json)}`)
const ticketsAfter = await call('GET', `/api/kitchen/tickets?storeId=${storeId}`)
check('past ticket still fully readable after product delete', ticketsAfter.json?.data?.tickets?.[0]?.items?.[0]?.name === 'Masala Chai E2E')

// ── summary ────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`)
if (failures.length === 0) {
  console.log(`ALL ${passed} CHECKS PASSED — college flows work end-to-end.\n`)
  process.exit(0)
} else {
  console.log(`${passed} passed, ${failures.length} FAILED:`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
}
