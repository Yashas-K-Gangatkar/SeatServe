// Sheet-link intelligence — pure, testable URL logic for the roster sync.
//
// The owner can point SHEET_SYNC_URL at any of:
//   • a Microsoft 365 share link (OneDrive personal "1drv.ms/…",
//     OneDrive for Business "*.sharepoint.com/:x:/g/…")
//   • a Google Sheets link (normal edit link, or already-published CSV)
//   • any direct .xlsx / .csv URL
//
// This module classifies a link, produces an ordered list of candidate URLs
// the server should try to download anonymously, and sniffs downloaded bytes
// so a login/preview page is never mistaken for the roster.

export type SheetLinkKind = 'google' | 'onedrive' | 'sharepoint' | 'direct' | 'unknown'

/** Trim, add https:// if missing, drop fragments (#gid=0 etc. never matter for downloads). */
export function normalizeSheetUrl(raw: string): string {
  let u = raw.trim()
  if (!u) return u
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  return u.split('#')[0]
}

export function classifySheetLink(raw: string): SheetLinkKind {
  const url = normalizeSheetUrl(raw)
  let host = ''
  let path = ''
  try {
    const parsed = new URL(url)
    host = parsed.hostname.toLowerCase()
    path = parsed.pathname
  } catch {
    return 'unknown'
  }
  if (host === 'docs.google.com') return 'google'
  if (host === 'sharepoint.com' || host.endsWith('.sharepoint.com')) return 'sharepoint'
  if (host === '1drv.ms' || host.endsWith('.onedrive.com') || host.endsWith('.microsoftpersonalcontent.com')) {
    return 'onedrive'
  }
  if (/\.(xlsx|csv)$/i.test(path)) return 'direct'
  return 'unknown'
}

/**
 * OneDrive "shares" API — converts an anonymous share link into the file
 * content itself. Encoding per spec: "u!" + unpadded base64url of the link.
 */
export function oneDriveSharesApiUrl(link: string): string {
  const b64 = Buffer.from(link, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `https://api.onedrive.com/v1.0/shares/u!${b64}/root/content`
}

function withDownloadParam(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}download=1`
}

/** Ordered candidate URLs to try (first success wins). */
export function candidateFetchUrls(raw: string): string[] {
  const url = normalizeSheetUrl(raw)

  switch (classifySheetLink(url)) {
    case 'google': {
      const m = /\/spreadsheets\/d\/([^/?#]+)/.exec(url)
      if (!m) return [url]
      if (/output=csv|format=csv|\/gviz\/tq/.test(url)) return [url]
      // normal edit/share link → CSV export of the first (or linked) tab
      const gid = (/[?&]gid=(\d+)/.exec(url) ?? /#gid=(\d+)/.exec(raw))?.[1]
      return [`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`]
    }
    case 'onedrive':
      return [oneDriveSharesApiUrl(url), withDownloadParam(url)]
    case 'sharepoint':
      return [withDownloadParam(url), oneDriveSharesApiUrl(url)]
    default:
      return [url]
  }
}

// ─────────────────────────── content sniffing ───────────────────────────

export type Sniffed = 'xlsx' | 'csv' | 'html' | 'json'

/**
 * Decide what we actually downloaded. ZIP magic beats content-type (OneDrive
 * sometimes labels octet-stream), HTML/login pages and JSON API errors are
 * rejected before they can poison the parser.
 */
export function sniffSheetBytes(bytes: Uint8Array, contentType: string | null): Sniffed {
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) return 'xlsx' // "PK"
  const ct = (contentType ?? '').toLowerCase()
  if (ct.includes('text/html')) return 'html'
  if (ct.includes('application/json')) return 'json'
  const sample = Buffer.from(bytes.slice(0, 512)).toString('utf8').trimStart()
  if (sample.startsWith('<')) return 'html'
  if (sample.startsWith('{') || sample.startsWith('[')) return 'json'
  return 'csv'
}
