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
    minutesUntilCutoff: Math.max(0, Math.floor(msUntilCutoff / 60_000)),
    minutesUntilShow: Math.max(0, Math.floor((startsAt.getTime() - now.getTime()) / 60_000)),
  }
}
