// Inspect prod staff/users/stores before seeding via the sync engine.
// Usage: DATABASE_URL=... bun scripts/inspect-prod-staff.ts
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const campus = await db.campus.findFirst({ orderBy: { createdAt: 'asc' } })
console.log('campus:', campus ? `${campus.name} (${campus.id})` : 'NONE')

const stores = await db.store.findMany({ select: { id: true, name: true, campusId: true } })
console.log('stores:', stores.map((s) => s.name).join(' | '))

const staff = await db.user.findMany({
  where: { role: { not: 'CUSTOMER' } },
  select: { id: true, email: true, name: true, role: true, isActive: true, storeId: true, phone: true },
})
for (const u of staff) {
  const storeName = stores.find((s) => s.id === u.storeId)?.name ?? '-'
  console.log(`staff: ${u.email} | ${u.name} | ${u.role} | store=${storeName} | active=${u.isActive} | phone=${u.phone}`)
}
await db.$disconnect()
