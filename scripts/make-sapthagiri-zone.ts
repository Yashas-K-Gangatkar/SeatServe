import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const zone = await db.deliveryZone.upsert({
  where: { id: 'placeholder' },
  create: { campusId: 'cmtrmpuu50001jp04ovpnqak4', name: 'Sapthagiri Campus', description: 'All blocks, classrooms and hostels on campus' },
  update: {},
}).catch(async (e) => {
  console.log('upsert-by-id failed (expected, no such id) — fallback to findFirst/create:', (e as Error).message.slice(0, 60))
  const found = await db.deliveryZone.findFirst({ where: { campusId: 'cmtrmpuu50001jp04ovpnqak4', name: 'Sapthagiri Campus' } })
  return found ?? db.deliveryZone.create({ data: { campusId: 'cmtrmpuu50001jp04ovpnqak4', name: 'Sapthagiri Campus', description: 'All blocks, classrooms and hostels on campus' } })
})
console.log('zone:', zone.id, zone.name)
await db.$disconnect()
