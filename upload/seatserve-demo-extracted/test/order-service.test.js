import test from 'node:test'
import assert from 'node:assert/strict'
import { createOrder } from '../src/order-service.js'

test('creates one paid order and totals items by store', () => {
  const order = createOrder({
    theatre: 'Aurora Mall Cinemas',
    screen: 'Screen 3',
    seat: 'F-12',
    items: [
      { id: 'popcorn', store: 'Cinema Snacks', name: 'Salted Popcorn', price: 180, quantity: 1 },
      { id: 'pizza', store: 'Pizza Corner', name: 'Veg Pizza', price: 250, quantity: 2 }
    ]
  })

  assert.deepEqual(order, {
    id: 'DEMO-001',
    theatre: 'Aurora Mall Cinemas',
    screen: 'Screen 3',
    seat: 'F-12',
    total: 680,
    paymentStatus: 'paid',
    vendorOrders: [
      { store: 'Cinema Snacks', total: 180, status: 'new' },
      { store: 'Pizza Corner', total: 500, status: 'new' }
    ]
  })
})

test('refuses an order without a seat or items', () => {
  assert.throws(() => createOrder({ screen: 'Screen 3', seat: '', items: [] }), {
    message: 'A seat and at least one item are required.'
  })
})
