import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const s = await db.store.findFirst({ where: { name: { contains: 'Boba' } }, include: { products: true } })
if (s) console.log(`STORE OK: ${s.name} | products: ${s.products.map(p => `${p.name} ₹${p.pricePaise/100}${p.isAvailable ? '' : ' [SOLD OUT]'}`).join(', ')} | kyc=${s.kycStatus} | open=${s.isOpen}`)
else console.log('STORE NOT FOUND')
await db.$disconnect()
