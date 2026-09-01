'use client'

/**
 * Testimonials — social proof. Cards reveal as one quiet group (CSS reveal);
 * the hover lift is the only ongoing motion. Loops here would cheapen real
 * quotes — restraint is the design.
 */
import { Star } from 'lucide-react'
import { useReveal } from '@/lib/motion/useReveal'

const REVIEWS = [
  {
    quote: 'Got my pizza in just 6 minutes! No waiting in line 🍕',
    name: 'Priya M.',
    meta: 'Mumbai · 2 weeks ago',
  },
  {
    quote: 'Ordered for my whole friend group — everything split perfectly at checkout 💳',
    name: 'Raj K.',
    meta: '1 week ago',
  },
  {
    quote: "Finally don't have to miss half the movie waiting for snacks!",
    name: 'Ananya S.',
    meta: 'Bengaluru · 3 days ago',
  },
]

export function Testimonials() {
  const reveal = useReveal<HTMLDivElement>()

  return (
    <section aria-label="Testimonials" className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
      <div ref={reveal} className="ss-reveal">
        <h2 className="text-center text-[28px] font-bold tracking-tight sm:text-[36px]">
          What users say
        </h2>
        <p className="mt-4 text-center text-[32px] font-black leading-none tracking-tight text-[#1A1A1A]">
          4.8{' '}
          <Star className="mb-1 inline h-6 w-6 fill-[#D4AF37] text-[#D4AF37]" aria-hidden />
        </p>
        <p className="mt-1 text-center text-[14px] text-[#6F6F6F]">
          Out of 250+ reviews
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3 sm:gap-6">
          {REVIEWS.map((review) => (
            <figure
              key={review.name}
              className="rounded-2xl border border-[#EFEAE0] bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all hover:-translate-y-1 hover:shadow-[0_10px_28px_rgba(0,0,0,0.12)]"
            >
              <div
                className="flex items-center gap-0.5 text-[#D4AF37]"
                aria-label="5 out of 5 stars"
              >
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-[#D4AF37]" aria-hidden />
                ))}
              </div>
              <blockquote className="mt-3">
                <p className="text-[14px] leading-[1.6] text-[#3F3F3F]">
                  “{review.quote}”
                </p>
              </blockquote>
              <figcaption className="mt-4">
                <p className="text-[13px] font-bold text-[#1A1A1A]">{review.name}</p>
                <p className="text-[11px] text-[#8B8B8B]">{review.meta}</p>
              </figcaption>
            </figure>
          ))}
        </div>

        <p className="mt-6 text-center text-[12px] text-[#8B8B8B]">
          Pilot feedback from the Aurora Mall demo.
        </p>
      </div>
    </section>
  )
}
