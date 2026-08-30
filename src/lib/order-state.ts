// SeatServe — ticket & order state machines (pure).
// Store ticket flow:  NEW → ACCEPTED → PREPARING → READY_FOR_PICKUP → PICKED_UP → DELIVERED
// Cancellation: allowed by staff from NEW / ACCEPTED / PREPARING only (food not yet out).

import type { OrderStatus, TicketStatus } from './types'

const NEXT_TICKET: Partial<Record<TicketStatus, TicketStatus>> = {
  NEW: 'ACCEPTED',
  ACCEPTED: 'PREPARING',
  PREPARING: 'READY_FOR_PICKUP',
  READY_FOR_PICKUP: 'PICKED_UP',
  PICKED_UP: 'DELIVERED',
}

const ALLOWED_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  NEW: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY_FOR_PICKUP', 'CANCELLED'],
  READY_FOR_PICKUP: ['PICKED_UP'],
  PICKED_UP: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
}

/** Kitchen may skip nothing; but bulk "accept & start" is a convenience on the client (two calls). */
export function canTransitionTicket(from: TicketStatus, to: TicketStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to)
}

export function nextTicketStatus(from: TicketStatus): TicketStatus | null {
  return NEXT_TICKET[from] ?? null
}

/** Which end of the flow each console controls. */
export function kitchenControls(status: TicketStatus): boolean {
  return status === 'NEW' || status === 'ACCEPTED' || status === 'PREPARING'
}

export function runnerControls(status: TicketStatus): boolean {
  return status === 'READY_FOR_PICKUP' || status === 'PICKED_UP'
}

/** Terminal, happy-path completion of every ticket completes the order. */
export function orderStatusFromTickets(tickets: { status: TicketStatus }[]): OrderStatus {
  if (tickets.length === 0) return 'PENDING_PAYMENT'
  if (tickets.every((t) => t.status === 'DELIVERED')) return 'COMPLETED'
  const allCancelled = tickets.every((t) => t.status === 'CANCELLED')
  if (allCancelled) return 'CANCELLED'
  const someCancelled = tickets.some((t) => t.status === 'CANCELLED')
  return someCancelled ? 'PARTIALLY_CANCELLED' : 'PAID'
}
