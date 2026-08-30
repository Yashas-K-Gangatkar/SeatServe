// SeatServe realtime service — socket.io hub.
// Client-facing socket.io: 0.0.0.0:3003, path '/' (Caddy forwards via XTransformPort).
// Internal event bus:     127.0.0.1:3004  POST /emit { rooms, event, data }
//   (separate loopback-only port because socket.io owns every request on path '/')
//
// Rooms:
//   order:<orderCode>   → customer tracking screens
//   store:<storeId>     → one store's kitchen dashboard (only its own tickets)
//   runners             → runner console
//   admin               → mall admin live board
import { createServer } from 'http'
import { Server } from 'socket.io'

const PORT = 3003
const INTERNAL_PORT = 3004

const io = new Server(PORT, {
  // DO NOT change the path — Caddy forwards on this path
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60_000,
  pingInterval: 25_000,
})

io.on('connection', (socket) => {
  socket.on('subscribe', (room: unknown) => {
    if (typeof room === 'string' && room.length > 0 && room.length < 120) {
      socket.join(room)
      socket.emit('subscribed', { room })
    }
  })
  socket.on('unsubscribe', (room: unknown) => {
    if (typeof room === 'string') socket.leave(room)
  })
})

const internal = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/emit') {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      try {
        const { rooms, event, data } = JSON.parse(body) as { rooms?: string[]; event?: string; data?: unknown }
        if (!Array.isArray(rooms) || typeof event !== 'string') {
          res.writeHead(400).end(JSON.stringify({ ok: false, error: 'rooms[] and event are required' }))
          return
        }
        let delivered = 0
        for (const room of rooms) {
          if (typeof room === 'string' && room.length > 0) {
            const size = io.sockets.adapter.rooms.get(room)?.size ?? 0
            delivered += size
            io.to(room).emit(event, data)
          }
        }
        res.writeHead(200).end(JSON.stringify({ ok: true, delivered }))
      } catch (err) {
        res.writeHead(400).end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'bad request' }))
      }
    })
    return
  }
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({ ok: true, service: 'seatserve-realtime', clients: io.sockets.sockets.size, time: new Date().toISOString() }),
    )
    return
  }
  res.writeHead(404).end(JSON.stringify({ ok: false, error: 'not found' }))
})

internal.listen(INTERNAL_PORT, '127.0.0.1', () => {
  console.log(`SeatServe realtime: socket.io on :${PORT} (path /), internal emit bus on 127.0.0.1:${INTERNAL_PORT}`)
})
