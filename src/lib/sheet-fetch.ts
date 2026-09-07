// fetchSheet — download the owner's roster from whatever link they pasted.
//
// Tries every candidate URL (see sheet-link.ts) until one yields a real file,
// sniffing bytes so a OneDrive sign-in page, a SharePoint "guest required"
// screen, or a JSON API error never reaches the parser. Injectable fetch
// keeps the whole thing unit-testable.

import { candidateFetchUrls, normalizeSheetUrl, sniffSheetBytes } from './sheet-link'

const MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 15_000
const MAX_REDIRECTS = 10

// Hosts allowed to receive cookies collected along the redirect chain.
// OneDrive accounts migrated to the SharePoint backend run an anonymous
// "redeem" dance: Authenticate.aspx sets a guest cookie (e.g. FedAuth) and
// the final download only works if that cookie rides along. We never send
// these cookies anywhere else.
const COOKIE_HOST_RE =
  /(^|\.)(1drv\.ms|onedrive\.com|live\.com|microsoftpersonalcontent\.com|sharepoint\.com|office\.com)$/i

// OneDrive's front door 403-rejects default runtime User-Agents (undici/node/bun)
// before the anonymous redeem dance can even start; a normal browser UA passes.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

function harvestSetCookies(headers: Headers, jar: Map<string, string>): void {
  const raw =
    (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ??
    (headers.get('set-cookie') ? [headers.get('set-cookie') as string] : [])
  for (const line of raw) {
    const pair = line.split(';')[0]
    const eq = pair.indexOf('=')
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
  }
}

/**
 * fetch with manual redirect-following and a small cookie jar.
 * undici's default `redirect: 'follow'` drops Set-Cookie between hops, which
 * breaks the OneDrive redeem dance; this replays them on Microsoft hosts only.
 */
async function fetchFollowCookies(target: string, fetchImpl: typeof fetch): Promise<Response> {
  const jar = new Map<string, string>()
  let url = target
  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    const headers: Record<string, string> = { 'user-agent': BROWSER_UA }
    const host = new URL(url).hostname
    if (jar.size > 0 && COOKIE_HOST_RE.test(host)) {
      headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
    }
    const res = await fetchImpl(url, {
      cache: 'no-store',
      redirect: 'manual',
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location')
      if (loc) {
        harvestSetCookies(res.headers, jar)
        url = new URL(loc, url).toString()
        continue
      }
    }
    return res
  }
  throw new Error(`more than ${MAX_REDIRECTS} redirects while downloading the sheet`)
}

export type FetchedSheet =
  | { ok: true; kind: 'xlsx'; bytes: Buffer; via: string }
  | { ok: true; kind: 'csv'; text: string; via: string }
  | { ok: false; status: number; error: string; tried: string[] }

export async function fetchSheet(rawUrl: string, fetchImpl: typeof fetch = fetch): Promise<FetchedSheet> {
  const url = normalizeSheetUrl(rawUrl)
  const candidates = candidateFetchUrls(url)
  const tried: string[] = []
  let lastProblem = 'nothing downloadable found'

  for (const target of candidates) {
    tried.push(target)

    let res: Response
    try {
      res = await fetchFollowCookies(target, fetchImpl)
    } catch (err) {
      lastProblem = err instanceof Error ? err.message : 'network error'
      continue
    }

    if (!res.ok) {
      lastProblem = `HTTP ${res.status}`
      continue
    }

    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await res.arrayBuffer())
    } catch (err) {
      lastProblem = err instanceof Error ? err.message : 'download interrupted'
      continue
    }
    if (bytes.byteLength > MAX_BYTES) {
      lastProblem = `file is larger than the ${Math.round(MAX_BYTES / 1024 / 1024)} MB limit`
      continue
    }

    const kind = sniffSheetBytes(bytes, res.headers.get('content-type'))
    if (kind === 'html') {
      lastProblem = 'got a sign-in / preview page instead of the file'
      continue
    }
    if (kind === 'json') {
      lastProblem = 'got a JSON API error instead of the file'
      continue
    }
    if (kind === 'csv') {
      return { ok: true, kind: 'csv', text: Buffer.from(bytes).toString('utf8'), via: target }
    }
    return { ok: true, kind: 'xlsx', bytes: Buffer.from(bytes), via: target }
  }

  return {
    ok: false,
    status: 502,
    tried,
    error:
      `Could not download the sheet (${lastProblem}). ` +
      'The link must be readable without logging in: ' +
      'OneDrive/Excel → Share → link settings → "Anyone with the link" (View); ' +
      'Google Sheets → File → Share → Publish to web → CSV.',
  }
}

