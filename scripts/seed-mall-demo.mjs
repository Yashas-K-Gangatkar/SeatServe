// Task 33 — seed the MALL DEMO on live prod (notifetch.in), as asha (MALL_ADMIN):
//   1. create "Wraphouse Kitchen" store + 6-item opening menu
//   2. attach the shipped food photos to every item
//   3. submit KYC (format-valid demo values) + VERIFY it
//   4. reassign bhagya (STORE_MANAGER, storeless) to the demo store
//   5. create Demo Chef (kitchen) + Demo Runner (delivery) logins
//   6. fetch one seat QR token for the demo customer link
// Every step prints its HTTP status; safe to re-run partially by hand.
const BASE = 'https://notifetch.in'

// --- node 18+ fetch has no cookie jar; do it manually ---
let cookie = ''
async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const setCookie = res.headers.getSetCookie?.() ?? []
  for (const c of setCookie) {
    const kv = c.split(';')[0]
    if (kv.startsWith('ss_session=')) cookie = kv
  }
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: res.status, json, text }
}

const log = (step, status, json) => {
  const brief = json ? JSON.stringify(json).slice(0, 220) : ''
  console.log(`[${status}] ${step} ${brief}`)
}

async function main() {
  // 0. login
  const r0 = await call('POST', '/api/auth/login', { email: 'asha@seatserve.demo', password: 'demo1234' })
  log('login asha', r0.status, r0.json?.data ? { role: r0.json.data.role } : r0.json)
  if (r0.status !== 200) process.exit(1)

  // 1. create the demo store with its opening menu
  const products = [
    { name: 'Butter Popcorn', description: 'Fresh theatre-style popcorn, real butter', category: 'Snacks', pricePaise: 4900, prepEstimateMin: 5, isVeg: true },
    { name: 'Samosa', description: 'Crispy punjabi samosa (2 pcs) with chutney', category: 'Snacks', pricePaise: 2500, prepEstimateMin: 6, isVeg: true },
    { name: 'Masala Chai', description: 'Hot cutting chai, brewed fresh', category: 'Hot Drinks', pricePaise: 2000, prepEstimateMin: 4, isVeg: true },
    { name: 'Cold Coffee', description: 'Chilled frothy cold coffee', category: 'Cold Drinks', pricePaise: 4500, prepEstimateMin: 5, isVeg: true },
    { name: 'Paneer Tikka Wrap', description: 'Grilled paneer, mint chutney, onions in a soft wrap', category: 'Wraps', pricePaise: 5900, prepEstimateMin: 8, isVeg: true },
    { name: 'Gulab Jamun', description: 'Warm gulab jamun (2 pcs)', category: 'Sweets', pricePaise: 3000, prepEstimateMin: 3, isVeg: true },
  ]
  const r1 = await call('POST', '/api/stores', {
    name: 'Wraphouse Kitchen',
    emoji: '🌯',
    tagline: 'Wraps, snacks & chai — delivered to your seat',
    prepBufferMin: 8,
    commissionPct: 6,
    products,
  })
  log('create store', r1.status, r1.json)
  if (r1.status === 409) { console.log('Store already exists — stopping (re-run only later steps by hand).'); return }
  if (r1.status !== 201) process.exit(1)
  const storeId = r1.json.data.store.id

  // 2. attach photos (product ids come from the created store; refetch via admin menu API)
  const rMenu = await call('GET', `/api/store/menu?storeId=${storeId}`)
  log('menu fetch', rMenu.status, { count: rMenu.json?.data?.products?.length })
  const imgByName = {
    'Butter Popcorn': '/menu/popcorn-butter.jpg',
    'Samosa': '/menu/samosa.jpg',
    'Masala Chai': '/menu/masala-chai.jpg',
    'Cold Coffee': '/menu/cold-coffee.jpg',
    'Paneer Tikka Wrap': '/menu/wrap-paneer-tikka.jpg',
    'Gulab Jamun': '/menu/gulab-jamun.jpg',
  }
  for (const p of rMenu.json?.data?.products ?? []) {
    const img = imgByName[p.name]
    if (!img) { console.log(`[warn] no image mapping for ${p.name}`); continue }
    const rp = await call('PATCH', `/api/products/${p.id}`, { imageUrl: img })
    log(`photo ${p.name}`, rp.status, { img })
  }

  // 3. KYC submit + verify
  const rk = await call('POST', `/api/stores/${storeId}/kyc`, {
    gstin: '27AABCU9603R1ZM',
    panMasked: 'ABCPA1234F',
    bankMasked: '4821',
    fssai: '10023456789012',
  })
  log('kyc submit', rk.status, { kycStatus: rk.json?.data?.kycStatus })
  const rv = await call('POST', `/api/admin/kyc/${storeId}`, { action: 'VERIFY' })
  log('kyc verify', rv.status, { kycStatus: rv.json?.data?.kycStatus })

  // 4. staff list → find bhagya + first zone
  const rs = await call('GET', '/api/admin/staff')
  log('staff list', rs.status, { n: rs.json?.data?.staff?.length, zones: rs.json?.data?.zones?.length })
  const staff = rs.json?.data?.staff ?? []
  const zones = rs.json?.data?.zones ?? []
  const bhagya = staff.find((s) => s.email === 'bhagya@gmail.com')

  // 5a. reassign bhagya to the demo store
  if (bhagya) {
    const rb = await call('PATCH', `/api/admin/staff/${bhagya.id}`, {
      action: 'REASSIGN', role: 'STORE_MANAGER', storeId,
    })
    log('reassign bhagya', rb.status, rb.json)
  } else {
    console.log('[warn] bhagya not found in staff list')
  }

  // 5b. create Demo Chef (kitchen staff at the store)
  const rc = await call('POST', '/api/admin/staff', {
    name: 'Demo Chef',
    email: 'chef@wraphouse.serve',
    phone: '+919900000101',
    role: 'KITCHEN_STAFF',
    storeId,
    password: 'WraphouseChef1',
  })
  log('create chef', rc.status, rc.json?.data?.staff ? { id: rc.json.data.staff.id } : rc.json)

  // 5c. create Demo Runner (needs a zone)
  if (zones.length > 0) {
    const rr = await call('POST', '/api/admin/staff', {
      name: 'Demo Runner',
      email: 'runner@wraphouse.serve',
      phone: '+919900000102',
      role: 'RUNNER',
      zoneId: zones[0].id,
      password: 'WraphouseRun1',
    })
    log('create runner', rr.status, rr.json?.data?.staff ? { id: rr.json.data.staff.id } : rr.json)
  } else {
    console.log('[warn] no delivery zones found — runner skipped')
  }

  // 6. demo seat QR token (Screen 1, seat A-1)
  const rq = await call('GET', '/api/admin/qr')
  const screens = rq.json?.data?.screens ?? []
  let seatToken = null
  for (const s of screens) {
    if (seatToken) break
    const rqs = await call('GET', `/api/admin/qr?screenId=${s.id}`)
    const seats = rqs.json?.data?.seats ?? rqs.json?.data?.screen?.seats ?? []
    const a1 = seats.find((x) => x.code === 'A-1') ?? seats[0]
    if (a1) seatToken = a1.qrToken
  }
  console.log('\n=== DEMO READY ===')
  console.log('storeId:', storeId)
  console.log('customer demo link:', seatToken ? `${BASE}/?qr=${seatToken}` : '(qr fetch failed — check /api/admin/qr)')
  console.log('staff logins:')
  console.log('  owner    asha@seatserve.demo / demo1234 (rotate pending)')
  console.log('  manager  ramesh@wraphouse.serve / 56LjnjZfKHhU')
  console.log('  store    bhagya@gmail.com / MilkShop22 (reassigned to demo store)')
  console.log('  kitchen  chef@wraphouse.serve / WraphouseChef1')
  console.log('  runner   runner@wraphouse.serve / WraphouseRun1')
}

main()
