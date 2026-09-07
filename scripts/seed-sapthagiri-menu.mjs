// Load the Sapthagiri Canteen test menu on PROD — every item ₹1 (pricePaise 100)
// because the owner is testing. Idempotent: skips names that already exist.
const BASE = 'https://notifetch.in'
const STORE_ID = 'cmtrmpuu7001jjp043qr6msc3'

// [name, description, category, isVeg, prepEstimateMin, imageUrl]
const MENU = [
  ['Seafood\'s Buttered Garlic', 'Spaghetti tossed in buttered-garlic seafood sauce', 'Pasta', false, 10, '/menu/garlic-bread.jpg'],
  ['Lasagna', 'Oven-baked layered pasta with rich meat sauce & cheese', 'Pasta', false, 12, '/menu/pizza-farmhouse.jpg'],
  ['Spagfries', 'Spaghetti n\' fries combo plate', 'Pasta', true, 8, '/menu/peri-peri-fries.jpg'],
  ['Double Cheese Beef Burger', 'Juicy beef patty loaded with double cheese', 'Burger and Sandwich', false, 9, '/menu/wrap-chicken-seekh.jpg'],
  ['Clubhouse with Fries', 'Triple-deck clubhouse served with golden fries', 'Burger and Sandwich', false, 8, '/menu/wrap-veg-burrito.jpg'],
  ['Egg Festive Sandwich', 'Egg celebration sandwich, festively stacked', 'Burger and Sandwich', false, 7, '/menu/wrap-paneer-tikka.jpg'],
  ['Egg/Tuna Sandwich', 'Classic egg or tuna sandwich', 'Burger and Sandwich', false, 7, '/menu/wrap-chicken-seekh.jpg'],
  ['Special Halo2x', 'House-special Filipino halo-halo mix', 'Halo2x And Desserts', true, 6, '/menu/gulab-jamun.jpg'],
  ['Ube Flan Halo2x', 'Halo-halo crowned with ube and creamy flan', 'Halo2x And Desserts', true, 6, '/menu/rasmalai.jpg'],
  ['Mango Magnifico', 'Mango-topped shaved ice dessert', 'Halo2x And Desserts', true, 5, '/menu/kaju-katli.jpg'],
  ['Churros n\' Chocolate Dip', 'Crisp churros sticks with chocolate dip', 'Halo2x And Desserts', true, 6, '/menu/gulab-jamun.jpg'],
  ['NSC1 - Nachos, Spaghetti, Clubhouse', 'Best for sharing: nachos + spaghetti + clubhouse', 'Combo Set', false, 15, '/menu/nachos-cheese.jpg'],
  ['CFC1 - Churros, Fries, Clubhouse', 'Best for sharing: churros + fries + clubhouse', 'Combo Set', false, 15, '/menu/peri-peri-fries.jpg'],
  ['CS1 - Flavored Chicken, Calamares, French Fries', 'Best for sharing: flavored chicken + calamares + fries', 'Combo Set', false, 15, '/menu/momo.jpg'],
  ['CS2 - Spag N\' Fries, Churros, Clubhouse, Flavored Chicken', 'Grand sharing combo: spaghetti n\' fries, churros, clubhouse, flavored chicken', 'Combo Set', false, 15, '/menu/pizza-margherita.jpg'],
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
  return { status: res.status, json }
}

const login = await call('POST', '/api/auth/login', { email: 'test.admin@notifetch.in', password: 'Test@1234' })
console.log('login:', login.status)
if (login.status !== 200) process.exit(1)

const existing = await call('GET', `/api/store/menu?storeId=${STORE_ID}`)
const have = new Set((existing.json?.data?.products ?? []).map((p) => p.name))
console.log('existing products:', have.size)

let added = 0, skipped = 0, failed = 0
for (const [name, description, category, isVeg, prepEstimateMin, imageUrl] of MENU) {
  if (have.has(name)) { skipped++; continue }
  const r = await call('POST', '/api/store/products', {
    storeId: STORE_ID, name, description, category,
    pricePaise: 100, taxRatePct: 5, prepEstimateMin, isVeg, imageUrl, isAvailable: true,
  })
  if (r.status === 201 || r.status === 200) added++
  else { failed++; console.log(`FAIL ${r.status} ${name}:`, JSON.stringify(r.json).slice(0, 150)) }
}
console.log(`menu: +${added} added, ${skipped} already present, ${failed} failed`)
const check = await call('GET', `/api/store/menu?storeId=${STORE_ID}`)
console.log('total products now:', check.json?.data?.products?.length)
