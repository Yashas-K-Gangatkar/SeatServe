// SeatServe Phase 2 — client-side staff auth helpers.
// The session lives in an httpOnly cookie; the client only ever reads the
// profile from /api/auth/me (it cannot touch or widen its own scope).
'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, post } from './api'

export interface StaffProfile {
  id: string
  name: string
  email: string | null
  role: 'MALL_ADMIN' | 'CINEMA_MANAGER' | 'STORE_MANAGER' | 'KITCHEN_STAFF' | 'RUNNER'
  mallId: string | null
  cinemaId: string | null
  storeId: string | null
  runnerId: string | null
}

export const ROLE_LABELS: Record<StaffProfile['role'], string> = {
  MALL_ADMIN: 'Mall Admin',
  CINEMA_MANAGER: 'Cinema Manager',
  STORE_MANAGER: 'Store Manager',
  KITCHEN_STAFF: 'Kitchen Staff',
  RUNNER: 'Delivery Runner',
}

export async function login(email: string, password: string): Promise<StaffProfile> {
  return post<StaffProfile>('/api/auth/login', { email, password })
}

export async function logout(): Promise<void> {
  await post('/api/auth/logout').catch(() => undefined)
}

/**
 * Session hook for staff views. `roles` is an allow-list; when the signed-in
 * user's role is not on it, status becomes 'forbidden' (the view renders a
 * "wrong console for your role" card). 401 from the server → 'unauthenticated'.
 */
export type AuthStatus = 'loading' | 'unauthenticated' | 'forbidden' | 'ok'

export function useStaffAuth(roles?: StaffProfile['role'][]) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<StaffProfile | null>(null)
  const [tick, setTick] = useState(0)
  const rolesKey = roles?.join('|') ?? ''

  useEffect(() => {
    let cancelled = false
    const allowed = rolesKey ? (rolesKey.split('|') as StaffProfile['role'][]) : undefined
    void (async () => {
      try {
        const me = await getMe()
        if (cancelled) return
        if (allowed && allowed.length > 0 && !allowed.includes(me.role)) {
          setUser(me)
          setStatus('forbidden')
          return
        }
        setUser(me)
        setStatus('ok')
      } catch {
        if (cancelled) return
        setUser(null)
        setStatus('unauthenticated')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [rolesKey, tick])

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  return { status, user, refresh }
}

async function getMe(): Promise<StaffProfile> {
  return api<StaffProfile>('/api/auth/me')
}
