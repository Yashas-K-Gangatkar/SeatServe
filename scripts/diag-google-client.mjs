// Diagnostic 2: is the Google OAuth client itself healthy?
// We hit Google's authorize endpoint exactly like /api/auth/google does and
// read the outcome. Outcomes:
//   consent page  → client_id + redirect_uri registered correctly (Google side OK)
//   redirect_uri_mismatch → the callback URI is NOT registered in Google Cloud
//   invalid client → client_id wrong/deleted
// NOTE: client_id is public info (it appears in every authorize redirect),
// the CLIENT SECRET is never used here and never printed.
import { readFileSync } from 'node:fs'

const env = readFileSync('/home/z/my-project/.env.google-oauth', 'utf8')
const clientId = env.match(/GOOGLE_CLIENT_ID=(.+)/)?.[1]?.trim()
const redirect = env.match(/GOOGLE_REDIRECT_URI=(.+)/)?.[1]?.trim()
if (!clientId || !redirect) { console.error('missing GOOGLE_CLIENT_ID / GOOGLE_REDIRECT_URI'); process.exit(1) }

console.log(`client_id        : ${clientId.slice(0, 12)}…${clientId.slice(-8)}`)
console.log(`redirect_uri     : ${redirect}`)

const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
url.searchParams.set('client_id', clientId)
url.searchParams.set('redirect_uri', redirect)
url.searchParams.set('response_type', 'code')
url.searchParams.set('scope', 'openid email profile')
url.searchParams.set('state', 'diag-probe-ignored')

const res = await fetch(url, { redirect: 'follow' })
const html = await res.text()
const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '(no title)'
console.log(`\nGoogle responded : HTTP ${res.status}`)
console.log(`page title       : ${title}`)

if (/redirect_uri_mismatch/i.test(html)) {
  console.log('\n→ VERDICT: REDIRECT_URI_MISMATCH — the callback URI is not registered in Google Cloud Console.')
  console.log('  Fix: Google Cloud Console → APIs & Services → Credentials → your OAuth client →')
  console.log(`       add "${redirect}" as an Authorized redirect URI.`)
} else if (/invalid client|invalid_client|Error 401/i.test(html)) {
  console.log('\n→ VERDICT: INVALID CLIENT — client_id unknown to Google (deleted or wrong project).')
} else if (/Sign in|accounts\.google\.com|choose an account|oauthchooser|ServiceLogin/i.test(html)) {
  console.log('\n→ VERDICT: HEALTHY — Google served the sign-in/consent page for this client.')
  console.log('  The Google Cloud side of the OAuth client is correctly configured.')
} else {
  console.log('\n→ VERDICT: UNCLEAR — dumping first hints below:')
  console.log(html.replace(/\s+/g, ' ').slice(0, 600))
}
