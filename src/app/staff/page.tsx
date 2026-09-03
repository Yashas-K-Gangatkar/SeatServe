'use client'

/**
 * /staff — staff sign-in entry point feeding the in-app sign-in console
 * (#/staff/login). Real deployments list NO accounts here: staff credentials
 * are issued privately by the venue administrator (Admin → Team panel).
 * (The old "pilot directory" that publicly exposed shared demo credentials
 * was removed when the platform went live.)
 */
import { LogIn, ShieldCheck } from 'lucide-react'
import { AuxPage } from '@/components/landing/AuxChrome'

export default function StaffPage() {
  return (
    <AuxPage>
      <h1 className="text-[32px] font-bold tracking-tight sm:text-[44px]">
        Staff sign-in
      </h1>
      <p className="mt-2 max-w-xl text-base leading-[1.6] text-[#6F6F6F]">
        Venue staff sign in to a console scoped to just their own store, zone or
        venue. Accounts are created by the venue administrator — ask your
        manager for your email and password.
      </p>

      <div className="mt-8 flex flex-col items-start gap-4">
        <a
          href="/#/staff/login"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-6 text-[15px] font-bold text-[#1A1A1A] shadow-[0_4px_12px_rgba(212,175,55,0.35)] transition-all hover:scale-[1.02] hover:bg-[#C39B2A] active:scale-[0.98]"
        >
          <LogIn className="h-4 w-4" aria-hidden />
          Continue to sign in
        </a>
      </div>

      <p className="mt-10 inline-flex items-center gap-2 rounded-lg bg-[#FBF9F3] px-3 py-1.5 text-[13px] font-semibold text-[#8B8B8B]">
        <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden />
        Sessions are encrypted cookies; every sign-in is rate-limited and
        audited.
      </p>
    </AuxPage>
  )
}
