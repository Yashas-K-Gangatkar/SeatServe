// fetchSheet — download the owner's roster from whatever link they pasted.
//
// Tries every candidate URL (see sheet-link.ts) until one yields a real file,
// sniffing bytes so a OneDrive sign-in page, a SharePoint "guest required"
// screen, or a JSON API error never reaches the parser. Injectable fetch
// keeps the whole thing unit-testable.

import { candidateFetchUrls, normalizeSheetUrl, sniffSheetBytes } from './sheet-link'

const MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 15_000

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
      res = await fetchImpl(target, {
        cache: 'no-store',
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
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

