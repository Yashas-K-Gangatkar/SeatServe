// Onboard Sapthagiri NPS University on PROD via the public self-serve wizard
// (the exact flow a real college uses), then log in as its admin.
// Mirrors scripts/seed-campus-demo.mjs but for the new college + test admin.
const BASE = 'https://notifetch.in'

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

const CREDS = { email: 'test.admin@notifetch.in', password: 'Test@1234' }

const r1 = await call('POST', '/api/onboard/campus', {
  campusName: 'Sapthagiri NPS University',
  city: 'Bengaluru',
  blockName: 'Main Block',
  classrooms: 2,
  seatRows: 5,
  seatCols: 5,
  storeName: 'Sapthagiri Canteen',
  adminName: 'Sapthagiri Test Admin',
  adminEmail: CREDS.email,
  adminPhone: '9900000011',
  password: CREDS.password,
})
console.log('onboard:', r1.status, JSON.stringify(r1.json?.data ?? r1.json).slice(0, 400))
if (r1.status !== 201 && r1.status !== 200) {
  // maybe already onboarded in a previous partial run — try logging in
  console.log('onboard did not create; attempting login of existing admin')
}

const r2 = await call('POST', '/api/auth/login', { email: CREDS.email, password: CREDS.password })
console.log('login:', r2.status, r2.status === 200 ? `role=${r2.json?.data?.role}` : r1.status === 201 ? 'FAILED' : '(admin may not exist — see onboard error)')
if (r2.status !== 200) process.exit(1)
console.log('SESSION-OK')
