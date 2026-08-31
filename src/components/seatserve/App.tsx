'use client'

// SeatServe — single-route hash router + app shell.
// Views: #/ · #/seat/<qrToken> · #/track/<code> · #/kitchen(/<storeId>)
//        #/runner(/<runnerId>) · #/admin · #/qr · #/menu · #/support(/<code>)
//        #/staff · #/staff/login   ← Phase 2 staff portal (separate site)
import { useEffect, useState, useCallback } from 'react'
import SeatLanding from './views/Landing'
import SeatPage from './views/SeatPage'
import Tracking from './views/Tracking'
import Kitchen from './views/Kitchen'
import Runner from './views/Runner'
import Admin from './views/Admin'
import QrAdmin from './views/QrAdmin'
import Support from './views/Support'
import MenuManager from './views/MenuManager'
import StaffLogin from './views/StaffLogin'
import StaffPortal from './views/StaffPortal'
import { OfflineBanner } from './ui-bits'
import { useOnline } from '@/lib/client/realtime'

export interface Route {
  name: 'landing' | 'seat' | 'track' | 'kitchen' | 'runner' | 'admin' | 'qr' | 'menu' | 'support' | 'staff' | 'staff-login'
  param?: string
}

function parseRoute(): Route {
  const params = new URLSearchParams(window.location.search)
  const qr = params.get('qr')
  const hash = window.location.hash.replace(/^#\/?/, '')
  // QR scanners land on /?qr=<token> — normalize into the hash route ONCE and
  // strip the query param. (Keeping it would re-trigger this branch on every
  // hashchange and bounce the customer back to the seat page after payment.)
  if (qr && !hash.startsWith('seat/')) {
    const url = new URL(window.location.href)
    url.searchParams.delete('qr')
    url.hash = `#/seat/${qr}`
    window.history.replaceState(null, '', url)
    return { name: 'seat', param: qr }
  }
  const [name, param] = hash.split('/')
  switch (name) {
    case 'seat':
      return { name: 'seat', param }
    case 'track':
      return { name: 'track', param }
    case 'kitchen':
      return { name: 'kitchen', param }
    case 'runner':
      return { name: 'runner', param }
    case 'admin':
      return { name: 'admin' }
    case 'qr':
      return { name: 'qr' }
    case 'menu':
      return { name: 'menu' }
    case 'support':
      return { name: 'support', param }
    case 'staff-login':
      return { name: 'staff-login' }
    case 'staff':
      // #/staff/login → dedicated login view; #/staff → portal hub
      return param === 'login' ? { name: 'staff-login' } : { name: 'staff' }
    default:
      return { name: 'landing' }
  }
}

export function navigate(path: string) {
  window.location.hash = path
}

export default function SeatServeApp() {
  const [route, setRoute] = useState<Route>({ name: 'landing' })
  const online = useOnline()

  useEffect(() => {
    const sync = () => setRoute(parseRoute())
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  const refreshRoute = useCallback(() => setRoute(parseRoute()), [])

  return (
    <div className="flex min-h-dvh flex-col">
      <OfflineBanner show={!online} />
      <main className="flex-1" aria-label="SeatServe">
        {route.name === 'landing' && <SeatLanding go={navigate} />}
        {route.name === 'seat' && <SeatPage qrToken={route.param ?? ''} go={navigate} />}
        {route.name === 'track' && <Tracking code={route.param ?? ''} go={navigate} />}
        {route.name === 'kitchen' && <Kitchen storeId={route.param} go={navigate} onRouteChange={refreshRoute} />}
        {route.name === 'runner' && <Runner runnerId={route.param} go={navigate} onRouteChange={refreshRoute} />}
        {route.name === 'admin' && <Admin go={navigate} />}
        {route.name === 'qr' && <QrAdmin go={navigate} />}
        {route.name === 'menu' && <MenuManager go={navigate} />}
        {route.name === 'support' && <Support code={route.param ?? ''} go={navigate} />}
        {route.name === 'staff-login' && <StaffLogin go={navigate} />}
        {route.name === 'staff' && <StaffPortal go={navigate} />}
      </main>
      {/* shell footer only for in-app views — the landing has its own dark footer */}
      {route.name !== 'landing' && (
        <footer className="print-hide mt-auto border-t border-border/60 py-4 text-center text-[11px] text-muted-foreground/70">
          SeatServe · In-seat ordering demo — no real payments are processed
        </footer>
      )}
    </div>
  )
}
