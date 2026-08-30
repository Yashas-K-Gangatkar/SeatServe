import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const root = join(process.cwd(), 'public')
const types = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript' }

createServer(async (request, response) => {
  const requested = request.url === '/' ? 'index.html' : request.url.slice(1)
  const file = normalize(join(root, requested))
  if (!file.startsWith(root)) {
    response.writeHead(403).end('Forbidden')
    return
  }
  try {
    const content = await readFile(file)
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' })
    response.end(content)
  } catch {
    response.writeHead(404).end('Not found')
  }
}).listen(3000, () => console.log('Demo ready at http://localhost:3000'))
