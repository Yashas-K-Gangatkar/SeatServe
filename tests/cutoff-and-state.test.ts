// SeatServe — cutoff rules & ticket state machine
import { describe, test, expect } from 'bun:test'
import { cutoffAt, cutoffInfo } from '../src/lib/cutoff'
import { canTransitionTicket, nextTicketStatus, kitchenControls, runnerControls, orderStatusFromTickets } from '../src/lib/order-state'
import type { TicketStatus } from '../src/lib/types'

describe('cutoff rules', () => {
  const show = new Date('2026-08-30T19:45:00+05:30')

  test('cutoff = start − N minutes', () => {
    expect(cutoffAt(show, 30).toISOString()).toBe(new Date('2026-08-30T19:15:00+05:30').toISOString())
  })

  test('ordering open before cutoff', () => {
    const now = new Date('2026-08-30T18:00:00+05:30')
    const info = cutoffInfo(show, 30, now)
    expect(info.orderingOpen).toBe(true)
    expect(info.minutesUntilCutoff).toBe(75)
    expect(info.minutesUntilShow).toBe(105)
  })

  test('ordering locked after cutoff', () => {
    const now = new Date('2026-08-30T19:16:00+05:30')
    expect(cutoffInfo(show, 30, now).orderingOpen).toBe(false)
  })

  test('boundary: exactly at cutoff is closed', () => {
    const now = cutoffAt(show, 30)
    expect(cutoffInfo(show, 30, now).orderingOpen).toBe(false)
  })
})

describe('ticket state machine', () => {
  const FLOW: TicketStatus[] = ['NEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'PICKED_UP', 'DELIVERED']

  test('happy path transitions allowed one step at a time', () => {
    for (let i = 0; i < FLOW.length - 1; i++) {
      expect(canTransitionTicket(FLOW[i], FLOW[i + 1])).toBe(true)
    }
  })

  test('skipping and reversing forbidden', () => {
    expect(canTransitionTicket('NEW', 'PREPARING')).toBe(false)
    expect(canTransitionTicket('NEW', 'DELIVERED')).toBe(false)
    expect(canTransitionTicket('PREPARING', 'ACCEPTED')).toBe(false)
    expect(canTransitionTicket('DELIVERED', 'NEW')).toBe(false)
    expect(canTransitionTicket('CANCELLED', 'ACCEPTED')).toBe(false)
  })

  test('cancellation only before food leaves the kitchen', () => {
    expect(canTransitionTicket('NEW', 'CANCELLED')).toBe(true)
    expect(canTransitionTicket('ACCEPTED', 'CANCELLED')).toBe(true)
    expect(canTransitionTicket('PREPARING', 'CANCELLED')).toBe(true)
    expect(canTransitionTicket('READY_FOR_PICKUP', 'CANCELLED')).toBe(false)
    expect(canTransitionTicket('PICKED_UP', 'CANCELLED')).toBe(false)
  })

  test('nextTicketStatus walks the flow, null at terminals', () => {
    expect(nextTicketStatus('NEW')).toBe('ACCEPTED')
    expect(nextTicketStatus('PICKED_UP')).toBe('DELIVERED')
    expect(nextTicketStatus('DELIVERED')).toBeNull()
    expect(nextTicketStatus('CANCELLED')).toBeNull()
  })

  test('console ownership', () => {
    expect(kitchenControls('PREPARING')).toBe(true)
    expect(kitchenControls('PICKED_UP')).toBe(false)
    expect(runnerControls('READY_FOR_PICKUP')).toBe(true)
    expect(runnerControls('PICKED_UP')).toBe(true)
    expect(runnerControls('PREPARING')).toBe(false)
  })
})

describe('order status derived from tickets', () => {
  test('all delivered → COMPLETED', () => {
    expect(orderStatusFromTickets([{ status: 'DELIVERED' }, { status: 'DELIVERED' }])).toBe('COMPLETED')
  })
  test('any live ticket keeps order PAID', () => {
    expect(orderStatusFromTickets([{ status: 'DELIVERED' }, { status: 'NEW' }])).toBe('PAID')
  })
  test('partial cancellation detected', () => {
    expect(orderStatusFromTickets([{ status: 'CANCELLED' }, { status: 'DELIVERED' }])).toBe('PARTIALLY_CANCELLED')
  })
  test('all cancelled → CANCELLED', () => {
    expect(orderStatusFromTickets([{ status: 'CANCELLED' }, { status: 'CANCELLED' }])).toBe('CANCELLED')
  })
  test('no tickets → PENDING_PAYMENT', () => {
    expect(orderStatusFromTickets([])).toBe('PENDING_PAYMENT')
  })
})
