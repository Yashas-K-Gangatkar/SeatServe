// Debug the OneDrive redirect chain hop-by-hop under bun's fetch.
const url = 'https://1drv.ms/x/c/2BF31EFB856A4D1A/IQD56mkdgRwHSYBjeG-uYC4vAfE74sDfbu6tTvhobQWa1BQ?download=1'
const jar = new Map<string, string>()
let u = url
for (let hop = 0; hop < 8; hop++) {
  const headers: Record<string, string> = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  }
  if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  const res = await fetch(u, { redirect: 'manual', headers, cache: 'no-store' })
  const sc = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? []
  console.log(`hop ${hop}: ${res.status} ${u.slice(0, 90)}... setCookie=${sc.length} ${sc.map((c) => c.split(';')[0]).join(' | ')}`)
  if (sc.length) console.log(`   raw set-cookie[0]: ${sc[0].slice(0, 120)}`)
  const loc = res.headers.get('location')
  if (loc && [301, 302, 303, 307, 308].includes(res.status)) {
    for (const line of sc) {
      const pair = line.split(';')[0]
      const eq = pair.indexOf('=')
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
    }
    u = new URL(loc, u).toString()
    continue
  }
  const buf = new Uint8Array(await res.arrayBuffer())
  console.log(`final: ${buf.byteLength} bytes, magic=${[...buf.slice(0, 2)].map((b) => b.toString(16)).join(' ')}, ct=${res.headers.get('content-type')}`)
  break
}
export {}
