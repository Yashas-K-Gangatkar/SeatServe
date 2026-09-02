// SeatServe — typed API client (relative paths only; gateway-friendly)
import type { ApiEnvelope } from './types'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      cache: 'no-store',
    })
  } catch {
    throw new ApiError('Network unreachable — check your connection', 0)
  }
  let json: ApiEnvelope<T>
  try {
    json = (await response.json()) as ApiEnvelope<T>
  } catch {
    throw new ApiError(`Server error (${response.status})`, response.status)
  }
  if (!response.ok || !json.ok || json.data === undefined) {
    throw new ApiError(json.error ?? `Request failed (${response.status})`, response.status)
  }
  return json.data
}

export const get = <T,>(path: string) => api<T>(path)
export const post = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) })
export const patch = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) })
export const del = <T,>(path: string) => api<T>(path, { method: 'DELETE' })
