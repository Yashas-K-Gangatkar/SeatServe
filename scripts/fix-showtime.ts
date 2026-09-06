import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const now = new Date()
const sts = await db.lecture.findMany({ include: { classroom: true } })
for (const st of sts) {
  const mins = Math.round((now.getTime() - st.startsAt.getTime()) / 60000)
  console.log(`${st.classroom.name} | "${st.subject}" | startsAt ${mins}min ago | cutoff ${st.orderCutoffMinutes} | active=${st.isActive} autoRoll=${st.demoAutoRoll}`)
}
await db.$disconnect()
