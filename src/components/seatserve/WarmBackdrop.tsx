// Soft warm blooms behind the staff work consoles — matches the landing's
// "Warm Ivory Cinema" look so the work screens don't feel flat grey-on-white.
export function WarmBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-amber-200/45 blur-3xl" />
      <div className="absolute -right-32 top-1/4 h-[28rem] w-[28rem] rounded-full bg-orange-200/40 blur-3xl" />
      <div className="absolute -bottom-32 left-1/4 h-96 w-96 rounded-full bg-rose-200/35 blur-3xl" />
    </div>
  )
}
