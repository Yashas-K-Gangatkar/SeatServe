'use client'

/**
 * NotiFetch landing — composition root.
 *
 * Replaces the old demo-hub landing with the marketing page from the live
 * deployment, rebuilt as modular sections and driven by the central motion
 * (src/lib/motion) + sound (src/lib/sound) systems.
 *
 * One SoundProvider wraps the whole page so cue state is shared; the demo
 * entry lookup (from /api/demo/entry) enables the "Try Demo" buttons exactly
 * like the previous landing did.
 */
import { useEffect, useState } from 'react'
import { SoundProvider } from '@/lib/sound/SoundProvider'
import { get } from '@/lib/client/api'
import { SiteHeader } from './sections/SiteHeader'
import { Hero } from './sections/Hero'
import { LiveStatus } from './sections/LiveStatus'
import { HowItWorks } from './sections/HowItWorks'
import { WhySeatServe } from './sections/WhySeatServe'
import { CtaBand } from './sections/CtaBand'
import { MenuShowcase } from './sections/MenuShowcase'
import { TrustStats } from './sections/TrustStats'
import { Testimonials } from './sections/Testimonials'
import { Faq } from './sections/Faq'
import { SiteFooter } from './sections/SiteFooter'

interface DemoEntry {
  aurora: { qrToken: string; seat: string; screen: string; mall: string } | null
  auroraBlocked: { qrToken: string; seat: string; screen: string } | null
  nexora: { qrToken: string; seat: string; screen: string; mall: string } | null
}

function useDemoSeat(): string | null {
  const [token, setToken] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void get<DemoEntry>('/api/demo/entry')
      .then((entry) => {
        if (!cancelled && entry?.aurora?.qrToken) setToken(entry.aurora.qrToken)
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
    <div className="flex min-h-dvh flex-col bg-[#FAF8F5] text-[#1A1A1A]">
      <SiteHeader />
      <main className="flex-1" aria-label="SeatServe">
        <Hero demoSeatHref={demoSeatHref} />
        <LiveStatus />
        <HowItWorks />
        <WhySeatServe />
        <CtaBand demoSeatHref={demoSeatHref} />
        <MenuShowcase />
        <TrustStats />
        <Testimonials />
        <Faq />
        {/* screen-reader live region — mirrors the live deployment */}
        <section aria-label="Notifications" aria-live="polite" aria-relevant="additions text" aria-atomic="false" className="sr-only" tabIndex={-1} />
      </main>
      <SiteFooter />
    </div>
  )
}

export default function Landing() {
  return (
    <SoundProvider>
      <LandingBody />
    </SoundProvider>
  )
}
