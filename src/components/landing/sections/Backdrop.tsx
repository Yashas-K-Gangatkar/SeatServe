/**
 * NotiFetch — ambient backdrop art (Haikei-style).
 *
 * Layered SVG blobs + a warm radial wash, drifting slowly behind the
 * marketing landing. Pure inline SVG (no network, no images), CSS-animated,
 * disabled under prefers-reduced-motion. Sits at -z-10 inside a relative
 * parent; its own overflow-hidden wrapper keeps blobs from causing scroll.
 */
export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* warm wash — brand tones at whisper opacity */}
      <div className="absolute inset-0 bg-[radial-gradient(60rem_42rem_at_88%_-12%,rgba(245,158,11,0.14),transparent_62%),radial-gradient(52rem_38rem_at_-12%_18%,rgba(244,63,94,0.07),transparent_55%),radial-gradient(46rem_32rem_at_50%_112%,rgba(249,115,22,0.09),transparent_58%)]" />

      {/* blob A — amber, slow clockwise drift */}
      <svg className="nf-blob nf-blob-a absolute -left-28 top-40 h-80 w-80" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="nf-blob-a-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FCD34D" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#F97316" stopOpacity="0.10" />
          </linearGradient>
        </defs>
        <path
          fill="url(#nf-blob-a-grad)"
          d="M44.7,-76.4C58.8,-69.3,71.8,-58.9,79.6,-45.6C87.4,-32.4,90,-16.2,88.5,-0.9C87,14.5,81.4,29,72.9,41.6C64.5,54.2,53.2,64.8,40.2,72.1C27.2,79.4,12.6,83.4,-1.6,86.2C-15.8,89,-31.6,90.5,-45.4,85.2C-59.2,79.8,-71,67.5,-78.2,53.2C-85.5,38.9,-88.2,22.6,-88.3,6.6C-88.4,-9.4,-85.9,-25.1,-78.7,-38.6C-71.5,-52.2,-59.6,-63.5,-45.8,-70.4C-32,-77.4,-16,-80,-0.4,-79.3C15.2,-78.6,30.5,-74.6,44.7,-76.4Z"
          transform="translate(100 100)"
        />
      </svg>

      {/* blob B — rose/peach, counter-drift */}
      <svg className="nf-blob nf-blob-b absolute -right-32 top-[36rem] h-96 w-96" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="nf-blob-b-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FDA4AF" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#FDBA74" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <path
          fill="url(#nf-blob-b-grad)"
          d="M59.4,-72.1C76.6,-62.5,89.4,-43.4,92.6,-23.1C95.8,-2.8,89.4,18.7,78.6,36.5C67.8,54.2,52.6,68.3,34.6,76.2C16.6,84.2,-4.2,86.1,-23.2,80.5C-42.2,74.9,-59.4,61.8,-70.6,44.8C-81.9,27.8,-87.3,6.9,-83.6,-12.3C-79.9,-31.4,-67.1,-48.9,-51,-58.7C-34.9,-68.5,-15.5,-70.7,2.9,-74.3C21.3,-77.9,42.1,-81.8,59.4,-72.1Z"
          transform="translate(100 100)"
        />
      </svg>

      {/* hairline wave — a Haikei signature transition under the hero */}
      <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 120" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <path
          fill="#F97316"
          fillOpacity="0.05"
          d="M0,64L60,69.3C120,75,240,85,360,80C480,75,600,53,720,48C840,43,960,53,1080,64C1200,75,1320,85,1380,90.7L1440,96L1440,120L0,120Z"
        />
        <path
          fill="#F59E0B"
          fillOpacity="0.04"
          d="M0,96L80,90.7C160,85,320,75,480,74.7C640,75,800,85,960,90.7C1120,96,1280,96,1360,96L1440,96L1440,120L0,120Z"
        />
      </svg>
    </div>
  )
}
