// Hit-audit — shared classification for the edge middleware and the
// hit-audit API routes. MUST stay dependency-free (middleware runs on the
// edge runtime; pulling in prisma/node APIs here would break the build).
//
// Why this exists: Vercel's "Requests" graph showed ~950k requests/day on
// notifetch.in while the app's own polling code is bounded (4–10s intervals,
// hidden-tab guard). The flood is almost certainly external bots/scanners,
// but the Vercel API token cannot read per-route observability data — so we
// instrument the edge ourselves and aggregate the answer into HitAudit rows.

/** Shared secret between the middleware and the flush/read routes. Compiled
 *  into server bundles only (never NEXT_PUBLIC), so it is not exposed to
 *  browsers. It only needs to stop random third parties from POSTing junk. */
export const AUDIT_KEY = 'hitaudit_' + 'v1_ctshop_edge_only'

// ── user-agent classification ────────────────────────────────────────────

const UA_RULES: ReadonlyArray<readonly [string, RegExp]> = [
  ['bytespider', /bytespider/], // ByteDance crawler — notorious for multi-RPS floods
  ['gptbot', /gptbot|oai-searchbot|chatgpt-user|perplexitybot/],
  ['claudebot', /claudebot|claude-web|anthropic-ai/],
  ['googlebot', /googlebot|adsbot-google|apis-google|mediapartners/],
  ['bingbot', /bingbot|adidxbot/],
  ['applebot', /applebot/],
  ['meta-preview', /meta-externalagent|facebookexternalhit|facebot|instagram/],
  ['whatsapp', /whatsapp/],
  ['telegram', /telegrambot/],
  ['yandex', /yandex/],
  ['petalbot', /petalbot/],
  ['seo-tools', /ahrefs|semrush|mj12bot|dotbot|dataforseo|serpstat|seokicks|megaindex|serpbot|blexbot/],
  ['python', /python-requests|python-urllib|aiohttp|httpx|pycurl/],
  ['curl-wget', /curl\/|wget|libwww|okhttp|go-http-client|java\/|apache-httpclient|libcurl/],
  ['node-fetch', /node-fetch|axios\/|undici|got\(|got /],
  ['headless', /headless|puppeteer|playwright|phantomjs|selenium|electron/],
  ['generic-bot', /bot|crawler|spider|slurp|scrapy|fetcher|monitor|uptime/],
]

/** Bucket a user-agent into a short class label. Anything unrecognized that
 *  still claims to be Mozilla lands in "browser", everything else in a
 *  bot:* bucket so unclassified floods are still visible. */
export function classifyUA(ua: string | null): string {
  if (!ua || ua.trim().length < 8) return 'bot:empty-ua'
  const u = ua.toLowerCase()
  for (const [name, re] of UA_RULES) {
    if (re.test(u)) return `bot:${name}`
  }
  if (u.includes('mozilla')) return 'browser'
  return 'bot:other'
}

// ── path handling ────────────────────────────────────────────────────────

/** Collapse a pathname into a small bucket: dynamic ids → :id/:n, cap length.
 *  Keeps the HitAudit table tiny even under a scanner storm. */
export function bucketPath(pathname: string): string {
  let out = pathname.split('?')[0] || '/'
  if (out.startsWith('/api/') && out.length > 1) {
    out = out.replace(/\/[A-Za-z0-9_-]{10,}/g, '/:id') // cuids / order codes
    out = out.replace(/\/\d+(?=\/|$)/g, '/:n')
  }
  if (out.length > 48) out = out.slice(0, 45) + '...'
  return out
}

/** Scanner probe paths (wp-*, .env, phpmyadmin, ...) — answered with an
 *  instant edge 403. Deliberately NARROW: it must never match a real
 *  NotiFetch route (/api/admin/... is ours and stays reachable). */
const JUNK_RE =
  /(^|\/)(\.env($|\.)|\.git($|\/)|\.aws($|\/)|\.ssh($|\/)|\.DS_Store$|wp-login\.php$|wp-admin($|\/)|wp-content($|\/)|wp-json($|\/)|xmlrpc\.php$|phpmyadmin($|\/)|pma($|\/)|adminer($|\/)|cgi-bin($|\/)|vendor\/phpunit|actuator($|\/)|telescope($|\/)|eval-stdin\.php$|HNAP1$|boaform($|\/)|GponForm($|\/)|owa($|\/)|autodiscover($|\/)|\.aspx?$|\.php$)/i

export function isJunkPath(pathname: string): boolean {
  return JUNK_RE.test(pathname)
}

// ── tiny non-crypto IP hash (diagnostics only, not a pseudonymised store) ─

export function ipHash(ip: string): string {
  let h = 5381
  for (let i = 0; i < ip.length; i++) h = ((h << 5) + h + ip.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

// ── flush payload shape ──────────────────────────────────────────────────

export interface HitRow {
  uaClass: string
  path: string
  count: number
  ips: number
}

export interface FlushPayload {
  day: string // 'YYYY-MM-DD' UTC
  rows: HitRow[]
}
