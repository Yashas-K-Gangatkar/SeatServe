// SeatServe — showtime cutoff rules (pure)

export interface CutoffInfo {
  orderingOpen: boolean
  cutoffAt: Date
  minutesUntilCutoff: number
  minutesUntilShow: number
}

export function cutoffAt(startsAt: Date, cutoffMinutes: number): Date {
  return new Date(startsAt.getTime() - cutoffMinutes * 60_000)
}

export function cutoffInfo(startsAt: Date, cutoffMinutes: number, now: Date = new Date()): CutoffInfo {
  const cutoff = cutoffAt(startsAt, cutoffMinutes)
  const msUntilCutoff = cutoff.getTime() - now.getTime()
  return {
    orderingOpen: msUntilCutoff > 0,
    cutoffAt: cutoff,
    // Audit fix #22: floor() showed "0m left" for up to 59 seconds while the
    // window was still open — ceil() only shows 0 when it is actually over.
    minutesUntilCutoff: Math.max(0, Math.ceil(msUntilCutoff / 60_000)),
    minutesUntilShow: Math.max(0, Math.floor((startsAt.getTime() - now.getTime()) / 60_000)),
  }
}
