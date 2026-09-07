import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const campuses = await db.campus.findMany({ select: { id: true, name: true } })
const staff = await db.user.findMany({
  where: { email: { contains: 'test.' } },
  select: { email: true, name: true, role: true, campusId: true, storeId: true, runnerId: true, isActive: true },
})
for (const u of staff) {
  const campus = campuses.find((c) => c.id === u.campusId)?.name ?? '?'
  const runner = u.runnerId ? await db.runner.findUnique({ where: { id: u.runnerId }, select: { zoneId: true, isOnDuty: true } }) : null
  console.log(`${u.email} | ${u.name} | ${u.role} | campus=${campus} | store=${u.storeId ? 'Sapthagiri Canteen' : '-'} | runner=${runner ? `zone=${campuses.find((c)=>c.id===runner.zoneId)?.name} duty=${runner.isOnDuty}` : '-'} | active=${u.isActive}`)
}
await db.$disconnect()
