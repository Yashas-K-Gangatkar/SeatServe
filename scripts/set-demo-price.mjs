// Task 34 — set "Masala Chai" at Wraphouse Kitchen to ₹2 (200 paise) on live prod
// so the owner can run a real Razorpay payment test for pocket change.
// Login: ramesh (CINEMA_MANAGER) — doubles as a live check that the delegated
// operator can reprice a mall store (Task 33 widening).
const BASE = 'https://notifetch.in'
const QR_TOKEN = 'GVTHGD4Q6F' // demo seat A-1
const ITEM = 'Masala Chai'
const NEW_PAISE = 200

let cookie = ''
async function call(method, path, body, useCookieJar = true) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(useCookieJar && cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (useCookieJar) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const kv = c.split(';')[0]
      if (kv.startsWith('ss_session=')) cookie = kv
    }
  }
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: res.status, json, text }
}

const log = (step, status, json) =>
  console.log(`[${status}] ${step} ${json ? JSON.stringify(json).slice(0, 200) : ''}`)

async function main() {
  // 1. login as the delegated manager
  const r0 = await call('POST', '/api/auth/login', { email: 'ramesh@wraphouse.serve', password: '56LjnjZfKHhU' })
  log('login ramesh', r0.status, r0.json?.data ? { role: r0.json.data.role } : r0.json)
  if (r0.status !== 200) process.exit(1)

  // 2. find Wraphouse Kitchen in his mall scope
  const r1 = await call('GET', '/api/admin/overview')
  log('overview', r1.status, { stores: r1.json?.data?.stores?.length })
  if (r1.status !== 200) process.exit(1)
  const store = (r1.json.data.stores ?? []).find((s) => s.name === 'Wraphouse Kitchen')
  if (!store) { console.log('FAIL: Wraphouse Kitchen not found in overview'); process.exit(1) }
  console.log('store:', store.id, store.name, 'kyc:', store.kycStatus ?? '?')

  // 3. menu → find the item + current price
  const r2 = await call('GET', `/api/store/menu?storeId=${store.id}`)
  log('menu', r2.status, { count: r2.json?.data?.products?.length })
  if (r2.status !== 200) process.exit(1)
  const item = (r2.json.data.products ?? []).find((p) => p.name === ITEM)
  if (!item) { console.log(`FAIL: ${ITEM} not on menu`); process.exit(1) }
  const before = item.pricePaise
  console.log(`item: ${item.id} ${ITEM} current ₹${(before / 100).toFixed(2)} (${before} paise)`)

  if (before === NEW_PAISE) {
    console.log('Already ₹2 — nothing to do.')
  } else {
    // 4. reprice to ₹2
    const r3 = await call('PATCH', `/api/products/${item.id}`, { pricePaise: NEW_PAISE })
    log('reprice', r3.status, r3.json?.data ?? r3.json)
    if (r3.status !== 200) process.exit(1)
  }

  // 5. verify what the CUSTOMER will see (public QR endpoint, no auth)
  const r4 = await call('GET', `/api/context?qr=${QR_TOKEN}`, null, false)
  log('customer context', r4.status, null)
  if (r4.status === 200) {
    const ws = (r4.json.data?.stores ?? []).find((s) => s.id === store.id || s.name === 'Wraphouse Kitchen')
    const p = (ws?.products ?? []).find((x) => x.name === ITEM)
    console.log('customer sees:', ws?.name, 'isOpen:', ws?.isOpen, '→', ITEM, '=', p ? `₹${(p.pricePaise / 100).toFixed(2)}` : 'MISSING')
    if (!p || p.pricePaise !== NEW_PAISE) { console.log('VERIFY FAILED'); process.exit(1) }
    console.log('VERIFY OK — customer menu shows the ₹2 price')
  } else {
    console.log('warn: could not verify via context API:', r4.text.slice(0, 200))
  }

  console.log(`\nDONE — ${ITEM} at Wraphouse Kitchen is now ₹${(NEW_PAISE / 100).toFixed(2)} (was ₹${(before / 100).toFixed(2)})`)
  console.log(`revert later with: PATCH /api/products/${item.id} {"pricePaise": ${before}}`)
}

main()
