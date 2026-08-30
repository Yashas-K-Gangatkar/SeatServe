// scripts/realtime-auth-check.ts <token> <room>
// Verifies the socket.io hub's room-token gate: exit 0 = subscribed,
// exit 1 = denied (or timed out). Used by scripts/api-golden-path.sh.
import { io } from 'socket.io-client'

const [, , token, room] = process.argv
if (!token || !room) {
  console.error('usage: bun scripts/realtime-auth-check.ts <token> <room>')
  process.exit(2)
}

const socket = io('http://localhost:3003', {
  path: '/',
  transports: ['websocket', 'polling'],
  timeout: 5000,
  reconnection: false,
})

const verdict = (ok: boolean, why: string) => {
  console.log(`${ok ? 'JOINED' : 'DENIED'} · ${why}`)
  socket.close()
  process.exit(ok ? 0 : 1)
}

const timer = setTimeout(() => verdict(false, 'timeout waiting for verdict'), 6000)

socket.on('connect', () => {
  socket.emit('subscribe', { room, token })
})
socket.on('subscribed', (payload: { room?: string }) => {
  clearTimeout(timer)
  verdict(payload?.room === room, `server accepted subscribe to ${payload?.room}`)
})
socket.on('subscribe:denied', (payload: { room?: string; reason?: string }) => {
  clearTimeout(timer)
  verdict(false, `server denied (${payload?.reason ?? 'unknown'})`)
})
socket.on('connect_error', (err: Error) => {
  clearTimeout(timer)
  verdict(false, `connect error: ${err.message}`)
})
