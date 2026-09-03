// Restore prod credentials from Vercel env API (owner-supplied token) + live Razorpay API check.
// Secrets are NEVER printed — only masked confirmations and API results.
import { readFileSync, writeFileSync } from 'fs'

const TOKEN = readFileSync('/home/z/my-project/.env.vercel-token', 'utf8').trim()
const PRJ = 'prj_r9FRGMhgZYcnkD3G3asUqlEK3X2a'

async function decrypt(envId) {
  const res = await fetch(`https://api.vercel.com/v10/projects/${PRJ}/env/${envId}?decrypt=true`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  const json = await res.json()
  const val = json.decrypted?.value ?? (json.value && !json.error ? json.value : undefined)
  if (!val) throw new Error(`decrypt failed for ${envId}: ${JSON.stringify(json).slice(0, 80)}`)
  return val
}

const dbUrl = await decrypt('PgKcf4I2GRNc3b17') // DATABASE_URL
const cronSecret = await decrypt('rHrWDmY4VznSh3S8') // CRON_SECRET
const rzpKey = await decrypt('AYWkIl2jd2mNDzgO')
const rzpSecret = await decrypt('A7LsoVBTyDrpylFO')

writeFileSync('/home/z/my-project/.env.prod-db', `DATABASE_URL=${dbUrl}\n`)
writeFileSync('/home/z/my-project/.env.cron-secret', `CRON_SECRET=${cronSecret}\n`)
console.log('DATABASE_URL restored →', dbUrl.slice(0, 30) + '…' + (dbUrl.includes('neon') ? ' (Neon ✓)' : ''))
console.log('CRON_SECRET restored  →', cronSecret.slice(0, 4) + '•••')
console.log('RAZORPAY_KEY_ID       →', rzpKey.slice(0, 11) + '…', rzpKey.startsWith('rzp_live_') ? '(LIVE MODE ✓)' : '(test mode)')

// ── Live Razorpay API checks (basic auth, money data is fine to show, secrets are not) ──
const auth = Buffer.from(`${rzpKey}:${rzpSecret}`).toString('base64')
const rzp = async (path) => {
  const res = await fetch(`https://api.razorpay.com/v1/${path}`, { headers: { Authorization: `Basic ${auth}` } })
  return { status: res.status, body: await res.json() }
}

const payments = await rzp('payments?count=5')
console.log('\n── GET /v1/payments (last 5) ──', payments.status === 200 ? '✓' : '✗ ' + payments.status)
if (payments.status === 200) {
  console.log('account is LIVE and answering with real payment data')
  for (const p of payments.body.items) {
    console.log(`  ${p.id}  ₹${(p.amount / 100).toFixed(2)}  ${p.status.toUpperCase()}  ${p.method ?? '?'}  ${new Date(p.created_at * 1000).toISOString().slice(0, 16)}`)
  }
} else {
  console.log(JSON.stringify(payments.body).slice(0, 200))
}

const settlements = await rzp('settlements?count=3')
console.log('\n── GET /v1/settlements (last 3) ──', settlements.status === 200 ? '✓' : `✗ ${settlements.status}`)
if (settlements.status === 200 && settlements.body.items?.length) {
  for (const s of settlements.body.items) {
    console.log(`  ${s.id}  ₹${(s.amount / 100).toFixed(2)}  ${s.status.toUpperCase()}  UTR ${s.utr ?? '-'}  ${new Date(s.created_at * 1000).toISOString().slice(0, 16)}`)
  }
} else if (settlements.status === 200) {
  console.log('  (no settlements yet — first T+2 settles after the first sales)')
} else {
  console.log('  ', JSON.stringify(settlements.body).slice(0, 160))
}

const balance = await rzp('balance')
console.log('\n── GET /v1/balance ──', balance.status === 200 ? `✓ ₹${(balance.body.balance / 100).toFixed(2)} available` : `✗ ${balance.status}`)
