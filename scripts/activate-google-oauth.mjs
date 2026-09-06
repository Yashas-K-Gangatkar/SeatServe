// Activate Google staff sign-in on the live Vercel project:
//   1. upsert GOOGLE_* env vars (encrypted, all targets)
//   2. delete stale API tokens (rotation the owner ordered — keep the fresh one)
//   3. trigger a production redeploy from GitHub main so envs take effect
//   4. poll the deployment to READY
// Secrets are sent to Vercel but NEVER printed — masked confirmations only.
import { readFileSync } from 'node:fs'

const TOKEN = readFileSync('/home/z/my-project/.env.vercel-token', 'utf8').trim()
const PRJ = 'prj_r9FRGMhgZYcnkD3G3asUqlEK3X2a'
const TEAM = 'team_NFWzuvgK5PeqooCa4tZtb7ki'
const API = 'https://api.vercel.com'

const envs = [
  { key: 'GOOGLE_CLIENT_ID', value: readFileSync('/home/z/my-project/.env.google-oauth', 'utf8').match(/GOOGLE_CLIENT_ID=(.+)/)[1].trim() },
  { key: 'GOOGLE_CLIENT_SECRET', value: readFileSync('/home/z/my-project/.env.google-oauth', 'utf8').match(/GOOGLE_CLIENT_SECRET=(.+)/)[1].trim() },
  { key: 'GOOGLE_REDIRECT_URI', value: 'https://notifetch.in/api/auth/google/callback' },
]

const mask = (v) => (v.length <= 8 ? '•••' : v.slice(0, 4) + '…' + v.slice(-3))
const H = { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }

async function call(method, path, body) {
  const res = await fetch(API + path + (path.includes('?') ? '&' : '?') + `teamId=${TEAM}`, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: res.status, json, text }
}

// 1. env upsert
for (const env of envs) {
  const created = await call('POST', `/v10/projects/${PRJ}/env`, {
    key: env.key, value: env.value, type: 'encrypted', target: ['production', 'preview', 'development'],
  })
  if (created.status === 201) { console.log(`[201] created ${env.key} = ${mask(env.value)}`); continue }
  if (created.status !== 409) { console.error(`[!] ${env.key} unexpected ${created.status}:`, created.text.slice(0, 200)); process.exit(1) }
  // conflict → patch existing
  const list = await call('GET', `/v10/projects/${PRJ}/env`)
  const existing = (list.json?.envs ?? []).find((e) => e.key === env.key)
  if (!existing) { console.error(`[!] ${env.key} conflict but not found`); process.exit(1) }
  const patched = await call('PATCH', `/v9/projects/${PRJ}/env/${existing.id}`, {
    value: env.value, target: ['production', 'preview', 'development'],
  })
  console.log(`[${patched.status}] patched ${env.key} = ${mask(env.value)}`)
  if (patched.status !== 200) process.exit(1)
}

// 2. stale token rotation — never touch tokens created today (the fresh one)
const list2 = await fetch(API + '/v3/user/tokens', { headers: H })
const tokensJson = await list2.json().catch(() => null)
const tokens = Array.isArray(tokensJson) ? tokensJson : (tokensJson?.tokens ?? [])
const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
for (const t of tokens) {
  const created = new Date(t.createdAt ?? 0)
  if (created >= todayStart) { console.log(`[keep] token "${t.name}" (created today)`) ; continue }
  const del = await fetch(API + `/v3/user/tokens/${t.id}`, { method: 'DELETE', headers: H })
  console.log(`[${del.status}] deleted stale token "${t.name}" from ${created.toISOString().slice(0, 10)}`)
}

// 3. production redeploy from GitHub main
const dep = await call('POST', '/v13/deployments', {
  name: 'ct_shop',
  target: 'production',
  gitSource: { type: 'github', org: 'Yashas-K-Gangatkar', repo: 'SeatServe', ref: 'main' },
})
if (dep.status >= 300) {
  console.error(`[!] redeploy trigger ${dep.status}:`, dep.text.slice(0, 300))
  console.error('    → owner fallback: Dashboard → Deployments → Redeploy (one click)')
  process.exit(1)
}
const depId = dep.json.id
console.log(`[▶] deployment ${depId} building…`)

// 4. poll to READY
const deadline = Date.now() + 6 * 60_000
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 12_000))
  const st = await call('GET', `/v13/deployments/${depId}`)
  const state = st.json?.readyState
  console.log(`    ${new Date().toISOString().slice(11, 19)} ${state}`)
  if (state === 'READY') { console.log('[✓] DEPLOY READY — Google env vars live'); process.exit(0) }
  if (state === 'ERROR' || state === 'CANCELED') { console.error('[!] deploy failed'); process.exit(1) }
}
console.error('[!] timed out waiting for deploy — check dashboard')
process.exit(1)
