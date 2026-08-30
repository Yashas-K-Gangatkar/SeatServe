import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const seat = await db.seat.findFirst({ include: { screen: { include: { cinema: true } } } })
  const prod = await db.product.findFirst({ include: { store: true } })
  if (!seat || !prod) throw new Error('no data')
  const order = await db.order.create({
    data: {
      code: 'SS-PROBE2',
      mallId: seat.screen.cinema.mallId,
      cinemaId: seat.screen.cinema.id,
      screenId: seat.screen.id,
      seatId: seat.id,
      status: 'PENDING_PAYMENT',
      paymentStatus: 'PENDING',
      subtotalPaise: 100, taxPaise: 5, deliveryFeePaise: 0, platformFeePaise: 0, totalPaise: 100,
      items: { create: [{ productId: prod.id, storeId: prod.storeId, nameSnapshot: 'x', unitPricePaise: 100, qty: 1, taxRatePct: 5, lineTotalPaise: 100 }] },
      tickets: { create: [{ storeId: prod.storeId, ticketCode: 'TK-PROBE2', status: 'NEW', subtotalPaise: 100, prepEtaMinutes: 10 }] },
      splits: {
        create: [
          { store: { connect: { id: prod.storeId } }, beneficiary: 'STORE', amountPaise: 95, commissionPaise: 0, taxPaise: 5, settlementStatus: 'PENDING' },
          { beneficiary: 'TAX', amountPaise: 5, commissionPaise: 0, taxPaise: 5, settlementStatus: 'PENDING' },
        ],
      },
    },
    include: { tickets: true, items: true, splits: true },
  })
  console.log('created', order.code, order.splits ? 'with splits' : '')
  await db.order.delete({ where: { code: 'SS-PROBE2' } })
  console.log('cleaned up')
}
main().catch((e) => { console.error('ERR:', (e as Error).message.slice(0, 300)); process.exit(1) }).finally(() => db.$disconnect())
