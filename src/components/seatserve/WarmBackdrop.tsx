// Warm backdrop behind every staff surface — login, gate cards and ALL signed-in
// consoles (painted by StaffGate). Previously just three faint corner blooms
// that read as "blank white" on real phones; now a full warm ivory→saffron
// wash + handloom-style dot grid so the work areas feel designed, not empty.
// Content sits on white cards above it — readability untouched.
export function WarmBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* warm ivory → saffron → rose wash: no more plain white canvas */}
      <div className="absolute inset-0 bg-gradient-to-b from-amber-50 via-orange-50/80 to-rose-50" />
      {/* handloom dot grid — quiet texture, not noise */}
      <div
        className="absolute inset-0 opacity-25"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(180,120,40,0.4) 1px, transparent 1.4px)',
          backgroundSize: '24px 24px',
        }}
      />
      {/* saffron blooms, lifted from the corners so mid-screen isn't empty */}
      <div className="absolute -left-32 -top-32 h-[26rem] w-[26rem] rounded-full bg-amber-300/60 blur-3xl" />
      <div className="absolute -right-32 top-1/4 h-[30rem] w-[30rem] rounded-full bg-orange-300/55 blur-3xl" />
      <div className="absolute -bottom-32 left-1/4 h-96 w-96 rounded-full bg-rose-300/45 blur-3xl" />
      <div className="absolute right-1/3 -top-24 h-72 w-72 rounded-full bg-yellow-200/60 blur-3xl" />
    </div>
  )
}
