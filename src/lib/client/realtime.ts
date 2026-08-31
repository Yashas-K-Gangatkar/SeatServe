'use client'

// SeatServe — realtime (socket.io) + polling helpers

import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    // path '/' + XTransformPort — the sandbox gateway forwards to the realtime mini-service
    socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      timeout: 5000,
    })
  }
  return socket
}

export interface RealtimeState {
  connected: boolean
  reconnecting: boolean
}

/** Staff rooms require an HMAC room token (audit fix #18). Order rooms are public. */
function isStaffRoom(room: string): boolean {
  return room.startsWith('admin:') || room.startsWith('runners:') || room.startsWith('store:')
}

// token cache: room → { token, expMs } with a 30s refresh margin
const roomTokenCache = new Map<string, { token: string; expMs: number }>()

async function roomAuthToken(room: string, retry = true): Promise<string | null> {
  if (!isStaffRoom(room)) return null
  const cached = roomTokenCache.get(room)
  if (cached && cached.expMs > Date.now() + 30_000) return cached.token
  try {
    const res = await fetch('/api/realtime/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room }),
      cache: 'no-store',
    })
    const json = (await res.json()) as { ok: boolean; data?: { token: string; expiresIn: number } }
    if (!json.ok || !json.data) {
      if (retry) {
        roomTokenCache.delete(room)
        return roomAuthToken(room, false)
      }
      return null
    }
    roomTokenCache.set(room, { token: json.data.token, expMs: Date.now() + json.data.expiresIn * 1000 })
    return json.data.token
  } catch {
    return null
  }
}

/** Subscribe to rooms; `onEvent` fires for every domain event. Callback kept in a ref (no re-subscribe). */
export function useRealtime(rooms: string[], onEvent?: (event: string, data: unknown) => void): RealtimeState {
  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const cbRef = useRef(onEvent)
  useEffect(() => {
    cbRef.current = onEvent
  })
  const roomsKey = rooms.join(',')

  useEffect(() => {
    let cancelled = false
    const s = getSocket()
    const joined = new Set<string>()

    const joinRoom = async (room: string) => {
      const token = await roomAuthToken(room)
      if (cancelled || joined.has(room)) return
      joined.add(room)
      // staff rooms: { room, token } — public rooms: legacy bare string
      if (token) s.emit('subscribe', { room, token })
      else s.emit('subscribe', room)
    }

    const onConnect = () => {
      setConnected(true)
      setReconnecting(false)
      for (const room of roomsKey.split(',').filter(Boolean)) void joinRoom(room)
    }
    const onDisconnect = () => {
      setConnected(false)
      joined.clear()
    }
    const onReconnectAttempt = () => setReconnecting(true)
    // server refused our staff-room token — drop cache; next connect retries fresh
    const onDenied = (payload: { room?: string }) => {
      if (payload?.room) roomTokenCache.delete(payload.room)
      if (payload?.room && s.connected) void joinRoom(payload.room)
    }
    const onDomain = (event: string, data: unknown) => cbRef.current?.(event, data)

    s.on('connect', onConnect)
    s.on('disconnect', onDisconnect)
    s.on('subscribe:denied', onDenied)
    s.io.on('reconnect_attempt', onReconnectAttempt)
    const events = ['ticket:new', 'ticket:status', 'order:paid', 'order:update', 'run:assigned', 'run:update', 'store:update', 'product:update']
    for (const e of events) s.on(e, (data: unknown) => onDomain(e, data))
    if (s.connected) onConnect()

    return () => {
      cancelled = true
      s.off('connect', onConnect)
      s.off('disconnect', onDisconnect)
      s.off('subscribe:denied', onDenied)
      s.io.off('reconnect_attempt', onReconnectAttempt)
      for (const e of events) s.off(e)
      for (const room of joined) s.emit('unsubscribe', room)
    }
  }, [roomsKey])

  return { connected, reconnecting }
}

/** Polling fallback — always-on so a socket hiccup never blinds a dashboard. */
export function usePolling(callback: () => void, ms: number, enabled = true) {
  const cbRef = useRef(callback)
  useEffect(() => {
    cbRef.current = callback
  })
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => cbRef.current(), ms)
    return () => clearInterval(id)
  }, [ms, enabled])
}

/** Simple connection banner state.
 *  Hydration-safe: first client render MUST match the server (`true`), the real
 *  value is synced after mount. (Node ≥21 exposes a `navigator` global without
 *  `onLine`, so reading it in the useState initializer breaks SSR hydration.) */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine)
    // sync the real value after mount (deferred — never during the effect body)
    const raf = requestAnimationFrame(sync)
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

// ── kitchen sound ────────────────────────────────────────────────
let audioCtx: AudioContext | null = null

export function armAudio(): void {
  if (!audioCtx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audioCtx = new Ctor()
  }
  if (audioCtx.state === 'suspended') void audioCtx.resume()
}

export function playChime(times = 2): void {
  if (!audioCtx) return
  for (let i = 0; i < times; i++) {
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    const t0 = audioCtx.currentTime + i * 0.32
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, t0)
    osc.frequency.setValueAtTime(1174, t0 + 0.09)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28)
    osc.connect(gain).connect(audioCtx.destination)
    osc.start(t0)
    osc.stop(t0 + 0.3)
  }
}
