// SeatServe realtime service — socket.io hub.
// Client-facing socket.io: 0.0.0.0:3003, path '/' (Caddy forwards via XTransformPort).
// Internal event bus:     127.0.0.1:3004  POST /emit { rooms, event, data }
//   (separate loopback-only port because socket.io owns every request on path '/')
//
// Rooms:
//   order:<orderCode>   → customer tracking screens (PUBLIC — code = capability)
//   store:<storeId>     → one store's kitchen dashboard (token required)
//   runners:<mallId>    → runner console, mall-scoped (token required)
//   admin:<mallId>      → mall admin live board, mall-scoped (token required)
//
// Audit fix #18: staff rooms used to accept ANY subscriber. Now a staff-room
// subscribe must carry an HMAC room token minted by /api/realtime/token.
import { createServer } from 'http'
import { Server } from 'socket.io'
import { verifyRoomToken, isStaffRoom } from '../../src/lib/realtime-auth'

const PORT = 3003
const INTERNAL_PORT = 3004
const ROOM_SECRET = process.env.REALTIME_ROOM_SECRET ?? 'sandbox_room_secret_dev_only'

const io = new Server(PORT, {
  // DO NOT change the path — Caddy forwards on this path
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60_000,
  pingInterval: 25_000,
})

io.on('connection', (socket) => {
  // clients send either the legacy bare string (public rooms only) or
  // { room, token } — staff rooms REQUIRE a valid token for THAT room
  socket.on('subscribe', (data: unknown) => {
    const room = typeof data === 'string' ? data : (typeof data === 'object' && data !== null ? (data as { room?: unknown }).room : undefined)
    const token = typeof data === 'object' && data !== null ? (data as { token?: unknown }).token : undefined
    if (typeof room !== 'string' || room.length === 0 || room.length >= 120) return

    if (isStaffRoom(room)) {
      const payload = verifyRoomToken(typeof token === 'string' ? token : '', ROOM_SECRET, room)
      if (!payload) {
        socket.emit('subscribe:denied', { room, reason: 'invalid-room-token' })
        return
      }
    }
    socket.join(room)
    socket.emit('subscribed', { room })
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
