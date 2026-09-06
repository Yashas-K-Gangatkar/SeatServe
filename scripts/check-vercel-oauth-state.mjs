// Read-only diagnostic: is Google OAuth live on the Vercel project?
// 1. list env keys on project (names only, never values)
// 2. latest production deployments (state, createdAt, commit)
// 3. compare env-upsert time vs latest deploy time
import { readFileSync } from 'node:fs'

const TOKEN = readFileSync('/home/z/my-project/.env.vercel-token', 'utf8').trim()
const PRJ = 'prj_r9FRGMhgZYcnkD3G3asUqlEK3X2a'
const TEAM = 'team_NFWzuvgK5PeqooCa4tZtb7ki'
const API = 'https://api.vercel.com'
const H = { Authorization: `Bearer ${TOKEN}` }

async function call(path) {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${API}${path}${sep}teamId=${TEAM}`, { headers: H })
  const text = await res.text()
  try { return { status: res.status, json: JSON.parse(text) } } catch { return { status: res.status, json: null, text: text.slice(0, 300) } }
}

const fmt = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'

// 1. env keys on the project
const envs = await call(`/v10/projects/${PRJ}/env`)
if (envs.status !== 200) {
  console.error(`[!] env list failed: HTTP ${envs.status}`)
  console.error(typeof envs.text === 'string' ? envs.text : JSON.stringify(envs.json).slice(0, 300))
  process.exit(1)
}
const keys = (envs.json?.envs ?? []).map((e) => `${e.key} [${(e.target ?? []).join(',')}] (updated ${fmt(e.updatedAt ?? e.createdAt ?? 0)})`)
console.log('== Project env vars ==')
keys.forEach((k) => console.log('  ' + k))
const g = (envs.json?.envs ?? []).filter((e) => e.key.startsWith('GOOGLE_'))
console.log(`\nGOOGLE_* vars present: ${g.map((e) => e.key).join(', ') || 'NONE'}`)

// 2. latest deployments
const deps = await call(`/v6/deployments?projectId=${PRJ}&limit=6&target=production`)
console.log('\n== Latest production deployments ==')
for (const d of deps.json?.deployments ?? []) {
  const commit = d.meta?.githubCommitSha?.slice(0, 7) ?? d.meta?.gitCommitSha?.slice(0, 7) ?? 'n/a'
  const msg = (d.meta?.githubCommitMessage ?? d.meta?.gitCommitMessage ?? '').slice(0, 60)
  console.log(`  ${fmt(d.createdAt)}  ${d.readyState.padEnd(8)}  ${commit}  ${msg}`)
}
const latest = deps.json?.deployments?.[0]
if (latest && g.length) {
  const envTime = Math.max(...g.map((e) => e.updatedAt ?? e.createdAt ?? 0))
  console.log(`\n== Timing check ==`)
  console.log(`  env vars last updated : ${fmt(envTime)}`)
  console.log(`  latest prod deploy at : ${fmt(latest.createdAt)} (${latest.readyState})`)
  console.log(
    envTime < latest.createdAt
      ? '  → OK: deploy happened AFTER env vars were set (envs should be live).'
      : '  → PROBLEM: env vars were set AFTER the latest deploy — a REDEPLOY is required for them to take effect.',
  )
}
