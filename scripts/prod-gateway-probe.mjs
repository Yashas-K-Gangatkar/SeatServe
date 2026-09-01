// Probe production: is the REAL Razorpay gateway active (env vars set)?
// Flow: demo seat → cheapest product → place order → ask /api/payments/session for mode.
// Harmless: the order stays PENDING_PAYMENT (demo mall), no money moves.
const BASE = 'https://ctshop-git-main-noti-fetch.vercel.app'

const j = (r) => r.json()

// 1) demo seat token
const entry = (await fetch(`${BASE}/api/demo/entry`).then(j))?.data
const qrToken = entry?.aurora?.qrToken
if (!qrToken) throw new Error('no demo seat token: ' + JSON.stringify(entry).slice(0, 200))
console.log('seat token ok')

// 2) pick the cheapest product across stores
const ctx = (await fetch(`${BASE}/api/context?qr=${encodeURIComponent(qrToken)}`).then(j))?.data
const stores = ctx?.stores ?? []
const products = stores.flatMap((s) => (s.products ?? []).map((p) => ({ ...p, store: s.name })))
if (products.length === 0) throw new Error('no products in context: ' + JSON.stringify(ctx).slice(0, 300))
products.sort((a, b) => a.pricePaise - b.pricePaise)
const item = products[0]
console.log(`cheapest item: ${item.name} (${item.store}) ₹${(item.pricePaise / 100).toFixed(2)}`)

// 3) place the order
const orderRes = await fetch(`${BASE}/api/orders`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ qrToken, items: [{ productId: item.id, qty: 1 }] }),
}).then(j)
if (!orderRes?.data?.code) {
  throw new Error('order failed: ' + JSON.stringify(orderRes).slice(0, 300))
}
const code = orderRes.data.code
console.log('order placed:', code, 'total ₹' + (orderRes.data.order?.totalPaise / 100 ?? '?'))

// 4) ask the session endpoint which gateway is live
const session = await fetch(`${BASE}/api/payments/session`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ orderCode: code }),
}).then(j)
console.log('SESSION RESULT:', JSON.stringify(session, null, 2).slice(0, 500))
if (session?.data?.mode === 'RAZORPAY') {
  console.log('✅ REAL RAZORPAY GATEWAY IS LIVE — all 4 env vars are set correctly')
} else if (session?.data?.mode === 'SANDBOX_MOCK') {
  console.log('❌ STILL SANDBOX_MOCK — env vars missing/misspelled in Vercel')
} else {
  console.log('session full:', JSON.stringify(session).slice(0, 400))
}
