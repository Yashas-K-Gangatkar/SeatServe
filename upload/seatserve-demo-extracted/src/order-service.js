export function createOrder({ theatre, screen, seat, items }) {
  if (!seat || !Array.isArray(items) || items.length === 0) {
    throw new Error('A seat and at least one item are required.')
  }

  const totalsByStore = new Map()
  for (const item of items) {
    const itemTotal = item.price * item.quantity
    totalsByStore.set(item.store, (totalsByStore.get(item.store) ?? 0) + itemTotal)
  }

  const vendorOrders = [...totalsByStore].map(([store, total]) => ({
    store,
    total,
    status: 'new'
  }))

  return {
    id: 'DEMO-001',
    theatre,
    screen,
    seat,
    total: vendorOrders.reduce((sum, vendorOrder) => sum + vendorOrder.total, 0),
    paymentStatus: 'paid',
    vendorOrders
  }
}
