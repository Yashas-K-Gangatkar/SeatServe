// Runtime verification for demo-roll.ts v2 (run with: bun scripts/roll-forward-check.ts)
// Scenario A — cutoff-passed dead zone: a show that has NOT started yet but whose
//   ordering cutoff already passed (the window that used to show "Ordering closed")
//   must be rolled forward to an open-cutoff show.
// Scenario B — last-resort mint: if every show on the classroom is blocked (no open
//   cutoff possible), rollStaleShowtimes must CREATE a fresh orderable lecture.
// Both scenarios restore the original DB state afterwards.
import { db } from '../src/lib/db'
import { rollStaleShowtimes } from '../src/lib/demo-roll'
import { pickCurrentShow } from '../src/lib/lecture'

interface Snapshot { id: string; subject: string; language: string | null; startsAt: Date; orderCutoffMinutes: number; demoAutoRoll: boolean; isActive: boolean }

async function snapshot(classroomId: string): Promise<Snapshot[]> {
  return db.lecture.findMany({ where: { classroomId }, orderBy: { startsAt: 'asc' } })
}

async function restore(classroomId: string, snap: Snapshot[]) {
  const current = await db.lecture.findMany({ where: { classroomId }, select: { id: true } })
  const kept = new Set(snap.map((s) => s.id))
  // delete any lectures created during the test
  for (const s of current) if (!kept.has(s.id)) await db.lecture.delete({ where: { id: s.id } })
  for (const s of snap) {
    await db.lecture.update({
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
    where: { classroom: { name: 'Classroom 3' }, code: 'A-1' },
    select: { classroomId: true },
  })
  if (!seat) throw new Error('demo seat Classroom 3 / A-1 not found')
  const classroomId = seat.classroomId
  const snap = await snapshot(classroomId)
  console.log(`Classroom 3 baseline: ${snap.length} lectures (order-bound shows are protected by audit fix #42)`)

  // Throwaway ORDERLESS lecture for roll scenarios (baseline shows here hold
  // pre-built demo orders, so they are correctly never rolled — rule 3 covers them).
  const mkShow = (startsAt: Date) =>
    db.lecture.create({
      data: { classroomId, subject: 'Roll-Check Feature', language: 'English', startsAt, orderCutoffMinutes: 30, demoAutoRoll: true },
      select: { id: true },
  })

  try {
    // ── Scenario A: cutoff passed, show not started (the 30-min dead zone) ──
    const a = await mkShow(new Date(Date.now() + 10 * 60_000)) // starts in 10 min → cutoff (30 min) already passed
    await rollStaleShowtimes(classroomId)
    const rolled = (await db.lecture.findUniqueOrThrow({ where: { id: a.id } }))
    const rolledOpen = rolled.startsAt.getTime() - rolled.orderCutoffMinutes * 60_000 > Date.now()
    const startedAhead = rolled.startsAt.getTime() > Date.now() + 60 * 60_000 // ≈ +120 min roll
    check('A1 · cutoff-passed show rolled forward', rolledOpen && startedAhead, `startsAt now ${rolled.startsAt.toISOString()}`)

    const showsA = await db.lecture.findMany({ where: { classroomId, isActive: true } })
    const pickedA = pickCurrentShow(showsA, new Date())
    check('A2 · context picker now sees an open cutoff', pickedA.reason === 'ordering-open' && pickedA.info!.orderingOpen, `reason=${pickedA.reason}`)

    // ── Scenario B: every show blocked (demoAutoRoll=false inside window) → mint fresh ──
    await restore(classroomId, snap)
    const nowMinus10 = new Date(Date.now() - 10 * 60_000) // inside 3h window, cutoff passed, NOT stale enough to re-arm
    await db.lecture.updateMany({ where: { classroomId }, data: { demoAutoRoll: false, startsAt: nowMinus10, orderCutoffMinutes: 30 } })
    await rollStaleShowtimes(classroomId)
    const afterB = await db.lecture.findMany({ where: { classroomId } })
    const createdB = afterB.filter((s) => !snap.some((o) => o.id === s.id))
    check('B1 · fresh lecture minted when none orderable', createdB.length >= 1, `created ${createdB.length}`)
    if (createdB.length >= 1) {
      const showsB = await db.lecture.findMany({ where: { classroomId, isActive: true } })
      const pickedB = pickCurrentShow(showsB, new Date())
      check('B2 · minted show is orderable', pickedB.reason === 'ordering-open' && pickedB.info!.orderingOpen, `reason=${pickedB.reason}`)
    }

    // ── Sanity: healthy future show is NOT touched ──
    const c = await mkShow(new Date(Date.now() + 3 * 60 * 60_000)) // starts in 3h → cutoff open
    await rollStaleShowtimes(classroomId)
    const untouched = (await db.lecture.findUniqueOrThrow({ where: { id: c.id } })).startsAt
    check('C1 · open-cutoff show left alone', untouched.getTime() > Date.now() + 2.5 * 60 * 60_000, '')
  } finally {
    await restore(classroomId, snap)
    const restored = await snapshot(classroomId)
    const same = restored.length === snap.length && restored.every((s, i) => s.id === snap[i].id && s.startsAt.getTime() === snap[i].startsAt.getTime() && s.demoAutoRoll === snap[i].demoAutoRoll)
    check('DB restored to baseline', same, '')
  }

  console.log(failures === 0 ? '\nALL ROLL-FORWARD CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
