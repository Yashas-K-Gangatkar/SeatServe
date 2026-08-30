// SeatServe — realtime bridge (server side).
// Next.js API routes publish domain events to the socket.io mini-service
// (port 3003) over an internal HTTP endpoint. Clients subscribe to rooms:
//   store:<storeId> | runners | admin | order:<orderCode>

const REALTIME_EMIT_URL = process.env.REALTIME_EMIT_URL ?? 'http://127.0.0.1:3004/emit'

export type RealtimeEvent =
  | 'ticket:new'
  | 'ticket:status'
  | 'order:paid'
  | 'order:update'
  | 'run:assigned'
  | 'run:update'
  | 'store:update'
  | 'product:update'

export interface EmitInput {
  rooms: string[]
  event: RealtimeEvent
  data: unknown
}

/** Best-effort broadcast — realtime is an enhancement, never a correctness dependency. */
export async function emitToRooms(input: EmitInput): Promise<void> {
  if (input.rooms.length === 0) return
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1500)
    await fetch(REALTIME_EMIT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    })
    clearTimeout(timer)
  } catch {
    // swallow: dashboards also poll as a fallback
  }
}
