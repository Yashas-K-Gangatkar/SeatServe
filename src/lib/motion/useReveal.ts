'use client'

/**
 * NotiFetch — scroll reveal hook for the CSS `.ss-reveal` layer.
 *
 * The landing baseline uses a CSS contract: elements start with `.ss-reveal`
 * (hidden, translated) and gain `.ss-reveal-in` when they enter the viewport.
 * This hook arms one IntersectionObserver per element and releases it once.
 * It exists so plain markup (no framer-motion) still participates in the same
 * scroll choreography.
 */
import { useEffect, useRef } from 'react'

export function useReveal<T extends HTMLElement = HTMLDivElement>(
  threshold = 0.18,
) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Reduced motion: the CSS layer already forces .ss-reveal to be visible;
    // still add the class so any draw-in children (ss-draw-check) complete.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('ss-reveal-in')
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('ss-reveal-in')
            io.unobserve(entry.target)
          }
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])

  return ref
}
