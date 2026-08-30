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
    const s = getSocket()
    const onConnect = () => {
      setConnected(true)
      setReconnecting(false)
      for (const room of roomsKey.split(',').filter(Boolean)) s.emit('subscribe', room)
    }
    const onDisconnect = () => {
      setConnected(false)
    }
    const onReconnectAttempt = () => setReconnecting(true)
    const onDomain = (event: string, data: unknown) => cbRef.current?.(event, data)

    s.on('connect', onConnect)
    s.on('disconnect', onDisconnect)
    s.io.on('reconnect_attempt', onReconnectAttempt)
    const events = ['ticket:new', 'ticket:status', 'order:paid', 'order:update', 'run:assigned', 'run:update', 'store:update', 'product:update']
    for (const e of events) s.on(e, (data: unknown) => onDomain(e, data))
    if (s.connected) onConnect()

    return () => {
      s.off('connect', onConnect)
      s.off('disconnect', onDisconnect)
      s.io.off('reconnect_attempt', onReconnectAttempt)
      for (const e of events) s.off(e)
      for (const room of roomsKey.split(',').filter(Boolean)) s.emit('unsubscribe', room)
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

/** Simple connection banner state */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
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
