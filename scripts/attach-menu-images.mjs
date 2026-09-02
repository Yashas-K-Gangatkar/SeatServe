// Attach the generated food photos to every production menu item.
// Waits until the new deployment (products expose imageUrl) is live, then
// logs in as the mall admin and PATCHes each product with /menu/<slug>.jpg.
const BASE = process.env.PROBE_BASE || 'https://notifetch.in'

const NAME_TO_FILE = {
  'Cold Coffee': 'cold-coffee',
  'Masala Chai': 'masala-chai',
  'Butter Popcorn (L)': 'popcorn-butter',
  'Salted Popcorn (L)': 'popcorn-salted',
  'Nachos with Cheese': 'nachos-cheese',
  'Samosa (2 pc)': 'samosa',
  'Filter Coffee': 'filter-coffee',
  'Gulab Jamun (2 pc)': 'gulab-jamun',
  'Kaju Katli (250g)': 'kaju-katli',
  'Rasmalai (2 pc)': 'rasmalai',
  'Farmhouse (10")': 'pizza-farmhouse',
  'Margherita (10")': 'pizza-margherita',
  'Paneer Tikka Pizza': 'pizza-paneer-tikka',
  'Garlic Bread Sticks': 'garlic-bread',
  'Peri Peri Fries': 'peri-peri-fries',
  momo: 'momo',
  'Chicken Seekh Wrap': 'wrap-chicken-seekh',
  'Paneer Tikka Wrap': 'wrap-paneer-tikka',
  'Veg Burrito': 'wrap-veg-burrito',
}

const j = async (r) => r.json()

async function waitForDeploy() {
  const deadline = Date.now() + 8 * 60_000
  while (Date.now() < deadline) {
    try {
      const entry = (await j(await fetch(`${BASE}/api/demo/entry`))).data
      const ctx = (await j(await fetch(`${BASE}/api/context?qr=${entry.aurora.qrToken}`))).data
      const first = ctx.stores?.[0]?.products?.[0]
      if (first && 'imageUrl' in first) {
        console.log('deploy live — imageUrl present in API')
        return entry
      }
      console.log('waiting for deploy…')
    } catch {
      console.log('waiting for deploy… (network)')
    }
    await new Promise((r) => setTimeout(r, 25_000))
  }
  throw new Error('deployment did not go live in time')
}

const entry = await waitForDeploy()
const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'asha@seatserve.demo', password: 'demo1234' }),
})
if (!loginRes.ok) throw new Error(`admin login failed: ${loginRes.status}`)
const cookie = loginRes.headers
  .getSetCookie()
  .map((c) => c.split(';')[0])
  .join('; ')
console.log('admin session ok')

const ctx = (await j(await fetch(`${BASE}/api/context?qr=${entry.aurora.qrToken}`))).data
let okCount = 0
let failCount = 0
for (const s of ctx.stores) {
  for (const p of s.products) {
    const file = NAME_TO_FILE[p.name]
    if (!file) {
      console.log(`NO MAP for "${p.name}" (${s.name}) — skipped`)
      failCount++
      continue
    }
    const r = await fetch(`${BASE}/api/products/${p.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ imageUrl: `/menu/${file}.jpg` }),
    })
    if (r.ok) {
      okCount++
      console.log(`OK  ${p.name} -> /menu/${file}.jpg`)
    } else {
      failCount++
      console.log(`FAIL ${p.name}: ${r.status} ${(await r.text()).slice(0, 120)}`)
    }
  }
}
console.log(`DONE: ${okCount} attached, ${failCount} problems`)
