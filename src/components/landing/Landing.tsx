'use client'

/**
 * NotiFetch landing — composition root.
 *
 * Replaces the old demo-hub landing with the marketing page from the live
 * deployment, rebuilt as modular sections and driven by the central motion
 * (src/lib/motion) + sound (src/lib/sound) systems.
 *
 * The root layout (src/app/layout.tsx) mounts ONE SoundProvider for the whole
 * app — marketing page, customer flow and staff consoles all share the same
 * cue state, so a preference set anywhere is honored everywhere.
 */
import { useEffect, useState } from 'react'
import { get } from '@/lib/client/api'
import { SiteHeader } from './sections/SiteHeader'
import { Backdrop } from './sections/Backdrop'
import { Hero } from './sections/Hero'
import { LiveStatus } from './sections/LiveStatus'
import { HowItWorks } from './sections/HowItWorks'
import { WhySeatServe } from './sections/WhySeatServe'
import { CtaBand } from './sections/CtaBand'
import { MenuShowcase } from './sections/MenuShowcase'
import { TrustStats } from './sections/TrustStats'
import { Faq } from './sections/Faq'
import { SiteFooter } from './sections/SiteFooter'

interface DemoEntry {
  demo: { qrToken: string; seat: string; classroom: string; campus: string } | null
}

function useDemoSeat(): string | null {
  const [token, setToken] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void get<DemoEntry>('/api/demo/entry')
      .then((entry) => {
        if (!cancelled && entry?.demo?.qrToken) setToken(entry.demo.qrToken)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])
  return token
}

function LandingBody() {
  const demoSeatToken = useDemoSeat()
  const demoSeatHref = demoSeatToken ? `#/seat/${demoSeatToken}` : null

  return (
    <div className="relative flex min-h-dvh flex-col bg-[#FAF8F5] text-[#1A1A1A]">
      <Backdrop />
      <SiteHeader />
      <main className="flex-1" aria-label="NotiFetch">
        <Hero demoSeatHref={demoSeatHref} />
        <LiveStatus />
        <HowItWorks />
        <WhySeatServe />
        <CtaBand demoSeatHref={demoSeatHref} />
        <MenuShowcase />
        <TrustStats />
        <Faq />
        {/* classroom-reader live region — mirrors the live deployment */}
        <section aria-label="Notifications" aria-live="polite" aria-relevant="additions text" aria-atomic="false" className="sr-only" tabIndex={-1} />
      </main>
      <SiteFooter />
    </div>
  )
}

export default function Landing() {
  return <LandingBody />
}
