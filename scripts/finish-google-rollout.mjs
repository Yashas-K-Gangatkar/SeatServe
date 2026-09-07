// finish-google-rollout.mjs — ONE command to flip Google sign-in ON for real.
// Run:  node scripts/finish-google-rollout.mjs
// Prereq: a FRESH FULL-SCOPE Vercel token written to .env.vercel-token
//         (Dashboard → Settings → Tokens → Create; scope must include Projects
//         + Deployments — the Sep 6 token was scope-limited and 403'd here).
//
// Steps: validate token scope → upsert GOOGLE_* env vars (from .env.google-oauth)
//        → confirm they're on the project → production redeploy from GitHub main
//        → poll to READY → probe /api/auth/providers (ACM may block server-side
//        probes; if so, a 10-second check in YOUR browser is the final verdict).
// Secrets are never printed — masked confirmations only.
import { readFileSync } from 'node:fs'

const TOKEN = (process.env.VERCEL_TOKEN ?? readFileSync('/home/z/my-project/.env.vercel-token', 'utf8')).trim()
const PRJ = 'prj_r9FRGMhgZYcnkD3G3asUqlEK3X2a'
const TEAM = 'team_NFWzuvgK5PeqooCa4tZtb7ki'
const API = 'https://api.vercel.com'
const H = { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }

const mask = (v) => (v.length <= 10 ? '•••' : v.slice(0, 5) + '…' + v.slice(-4))
const call = async (method, path, body) => {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${API}${path}${sep}teamId=${TEAM}`, {
    method, headers: H, body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null; try { json = JSON.parse(text) } catch {}
  return { status: res.status, json, text }
}

// 0. token + scope validation
const me = await call('GET', '/v2/user')
if (me.status !== 200) { console.error(`[✗] token rejected at /v2/user (HTTP ${me.status}) — mint a fresh one.`); process.exit(1) }
console.log(`[✓] token valid (user ${me.json?.user?.username ?? me.json?.user?.email ?? '?'})`)
const envProbe = await call('GET', `/v10/projects/${PRJ}/env`)
if (envProbe.status !== 200) {
  console.error(`[✗] token CANNOT read project envs (HTTP ${envProbe.status}) — scope-limited again?`)
  console.error('    Re-create the token with full scope (or at least Projects: read/write + Deployments).')
  process.exit(1)
}
console.log('[✓] token can manage project env vars')

// 1. upsert GOOGLE_* env vars
const raw = readFileSync('/home/z/my-project/.env.google-oauth', 'utf8')
const wanted = [
  { key: 'GOOGLE_CLIENT_ID', value: raw.match(/GOOGLE_CLIENT_ID=(.+)/)[1].trim() },
  { key: 'GOOGLE_CLIENT_SECRET', value: raw.match(/GOOGLE_CLIENT_SECRET=(.+)/)[1].trim() },
  { key: 'GOOGLE_REDIRECT_URI', value: 'https://notifetch.in/api/auth/google/callback' },
]
const existingKeys = new Set((envProbe.json?.envs ?? []).map((e) => e.key))
for (const env of wanted) {
  if (existingKeys.has(env.key)) {
    const existing = (envProbe.json?.envs ?? []).find((e) => e.key === env.key)
    const patched = await call('PATCH', `/v9/projects/${PRJ}/env/${existing.id}`, {
      value: env.value, target: ['production', 'preview', 'development'],
    })
    console.log(`[${patched.status}] patched ${env.key} = ${mask(env.value)}${patched.status !== 200 ? ' ← ' + patched.text.slice(0, 120) : ''}`)
  } else {
    const created = await call('POST', `/v10/projects/${PRJ}/env`, {
      key: env.key, value: env.value, type: 'encrypted', target: ['production', 'preview', 'development'],
    })
    console.log(`[${created.status}] created ${env.key} = ${mask(env.value)}${created.status !== 201 ? ' ← ' + created.text.slice(0, 120) : ''}`)
  }
}

// 2. confirm envs present
const after = await call('GET', `/v10/projects/${PRJ}/env`)
const keys = (after.json?.envs ?? []).filter((e) => e.key.startsWith('GOOGLE_')).map((e) => e.key)
console.log(`[✓] GOOGLE_* on project: ${keys.join(', ') || 'NONE ← upsert failed, stop'}`)
if (keys.length < 3) process.exit(1)

// 3. production redeploy from GitHub main (envs only apply to NEW deployments)
const dep = await call('POST', '/v13/deployments', {
  name: 'ct_shop', target: 'production',
  gitSource: { type: 'github', org: 'Yashas-K-Gangatkar', repo: 'SeatServe', ref: 'main' },
})
if (dep.status >= 300) {
  console.error(`[!] deploy trigger ${dep.status}: ${dep.text.slice(0, 200)}`)
  console.error('    → manual fallback: Dashboard → ct_shop → Deployments → ⋯ → Redeploy')
  process.exit(1)
}
const depId = dep.json.id
console.log(`[▶] deployment ${depId} building…`)

// 4. poll to READY
const deadline = Date.now() + 9 * 60_000
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 12_000))
  const st = await call('GET', `/v13/deployments/${depId}`)
  const state = st.json?.readyState
  console.log(`    ${new Date().toISOString().slice(11, 19)} ${state}`)
  if (state === 'READY') break
  if (state === 'ERROR' || state === 'CANCELED') { console.error('[✗] deploy failed'); process.exit(1) }
  if (Date.now() + 12_000 >= deadline) { console.error('[!] timed out — check dashboard'); process.exit(1) }
}

// 5. verify — server-side probe may hit Attack Challenge Mode; browser check is final
const url = `https://${dep.json.alias?.[0] ?? 'notifetch.in'}/api/auth/providers`
try {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }, redirect: 'follow' })
  const body = await res.text()
  const m = body.match(/\{"ok":true,"data":\{[^}]*\}/)
  console.log(m ? `[✓] ${url} → ${m[0]}` : `[?] ${url} → HTTP ${res.status} (challenge page? check in a real browser)`)
} catch (e) {
  console.log(`[?] probe failed (${e.message}) — check in a real browser`)
}
console.log(`
──────────────────────────────────────────────────────────
FINAL CHECK (10 seconds, in YOUR browser):
  1. open  https://notifetch.in/#/staff/login
  2. "Sign in with Google" button visible?  → click it, pick your account
     ├─ straight into the portal  → DONE ✔
     └─ "not registered as staff" → log in with email+password →
        Admin → My team → Add person → your exact Gmail → retry Google
  3. button NOT visible? → this deploy didn't pick up env vars;
     redeploy once more from the dashboard and re-check.
Remember: Google sign-in is for the STAFF portal only — customers never
log in, they scan their seat QR.
──────────────────────────────────────────────────────────`)
