// Runtime verification for demo-roll.ts v2 (run with: bun scripts/roll-forward-check.ts)
// Scenario A — cutoff-passed dead zone: a show that has NOT started yet but whose
//   ordering cutoff already passed (the window that used to show "Ordering closed")
//   must be rolled forward to an open-cutoff show.
// Scenario B — last-resort mint: if every show on the screen is blocked (no open
//   cutoff possible), rollStaleShowtimes must CREATE a fresh orderable showtime.
// Both scenarios restore the original DB state afterwards.
import { db } from '../src/lib/db'
import { rollStaleShowtimes } from '../src/lib/demo-roll'
import { pickCurrentShow } from '../src/lib/showtime'

interface Snapshot { id: string; movieTitle: string; language: string | null; startsAt: Date; orderCutoffMinutes: number; demoAutoRoll: boolean; isActive: boolean }

async function snapshot(screenId: string): Promise<Snapshot[]> {
  return db.showtime.findMany({ where: { screenId }, orderBy: { startsAt: 'asc' } })
}

async function restore(screenId: string, snap: Snapshot[]) {
  const current = await db.showtime.findMany({ where: { screenId }, select: { id: true } })
  const kept = new Set(snap.map((s) => s.id))
  // delete any showtimes created during the test
  for (const s of current) if (!kept.has(s.id)) await db.showtime.delete({ where: { id: s.id } })
  for (const s of snap) {
    await db.showtime.update({
      where: { id: s.id },
      data: { startsAt: s.startsAt, orderCutoffMinutes: s.orderCutoffMinutes, demoAutoRoll: s.demoAutoRoll, isActive: s.isActive },
    })
  }
}

let failures = 0
function check(name: string, cond: boolean, detail: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} · ${name}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

async function main() {
  const seat = await db.seat.findFirst({
    where: { screen: { name: 'Screen 3' }, code: 'A-1' },
    select: { screenId: true },
  })
  if (!seat) throw new Error('demo seat Screen 3 / A-1 not found')
  const screenId = seat.screenId
  const snap = await snapshot(screenId)
  console.log(`Screen 3 baseline: ${snap.length} showtimes (order-bound shows are protected by audit fix #42)`)

  // Throwaway ORDERLESS showtime for roll scenarios (baseline shows here hold
  // pre-built demo orders, so they are correctly never rolled — rule 3 covers them).
  const mkShow = (startsAt: Date) =>
    db.showtime.create({
      data: { screenId, movieTitle: 'Roll-Check Feature', language: 'English', startsAt, orderCutoffMinutes: 30, demoAutoRoll: true },
      select: { id: true },
  })

  try {
    // ── Scenario A: cutoff passed, show not started (the 30-min dead zone) ──
    const a = await mkShow(new Date(Date.now() + 10 * 60_000)) // starts in 10 min → cutoff (30 min) already passed
    await rollStaleShowtimes(screenId)
    const rolled = (await db.showtime.findUniqueOrThrow({ where: { id: a.id } }))
    const rolledOpen = rolled.startsAt.getTime() - rolled.orderCutoffMinutes * 60_000 > Date.now()
    const startedAhead = rolled.startsAt.getTime() > Date.now() + 60 * 60_000 // ≈ +120 min roll
    check('A1 · cutoff-passed show rolled forward', rolledOpen && startedAhead, `startsAt now ${rolled.startsAt.toISOString()}`)

    const showsA = await db.showtime.findMany({ where: { screenId, isActive: true } })
    const pickedA = pickCurrentShow(showsA, new Date())
    check('A2 · context picker now sees an open cutoff', pickedA.reason === 'ordering-open' && pickedA.info!.orderingOpen, `reason=${pickedA.reason}`)

    // ── Scenario B: every show blocked (demoAutoRoll=false inside window) → mint fresh ──
    await restore(screenId, snap)
    const nowMinus10 = new Date(Date.now() - 10 * 60_000) // inside 3h window, cutoff passed, NOT stale enough to re-arm
    await db.showtime.updateMany({ where: { screenId }, data: { demoAutoRoll: false, startsAt: nowMinus10, orderCutoffMinutes: 30 } })
    await rollStaleShowtimes(screenId)
    const afterB = await db.showtime.findMany({ where: { screenId } })
    const createdB = afterB.filter((s) => !snap.some((o) => o.id === s.id))
    check('B1 · fresh showtime minted when none orderable', createdB.length >= 1, `created ${createdB.length}`)
    if (createdB.length >= 1) {
      const showsB = await db.showtime.findMany({ where: { screenId, isActive: true } })
      const pickedB = pickCurrentShow(showsB, new Date())
      check('B2 · minted show is orderable', pickedB.reason === 'ordering-open' && pickedB.info!.orderingOpen, `reason=${pickedB.reason}`)
    }

    // ── Sanity: healthy future show is NOT touched ──
    const c = await mkShow(new Date(Date.now() + 3 * 60 * 60_000)) // starts in 3h → cutoff open
    await rollStaleShowtimes(screenId)
    const untouched = (await db.showtime.findUniqueOrThrow({ where: { id: c.id } })).startsAt
    check('C1 · open-cutoff show left alone', untouched.getTime() > Date.now() + 2.5 * 60 * 60_000, '')
  } finally {
    await restore(screenId, snap)
    const restored = await snapshot(screenId)
    const same = restored.length === snap.length && restored.every((s, i) => s.id === snap[i].id && s.startsAt.getTime() === snap[i].startsAt.getTime() && s.demoAutoRoll === snap[i].demoAutoRoll)
    check('DB restored to baseline', same, '')
  }

  console.log(failures === 0 ? '\nALL ROLL-FORWARD CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
