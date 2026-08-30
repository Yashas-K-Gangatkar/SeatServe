// SeatServe — shared types & constants (SQLite has no enums; these are the source of truth)

export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'COMPLETED',
  'CANCELLED',
  'PARTIALLY_CANCELLED',
  'REFUNDED',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const ORDER_PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'] as const
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number]

export const TICKET_STATUSES = [
  'NEW',
  'ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'PICKED_UP',
  'DELIVERED',
  'CANCELLED',
] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const PAYMENT_METHODS = ['UPI', 'CARD', 'NETBANKING'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_STATUSES = ['INITIATED', 'SUCCESS', 'FAILED'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const SPLIT_BENEFICIARIES = ['STORE', 'PLATFORM_COMMISSION'] as const
export type SplitBeneficiary = (typeof SPLIT_BENEFICIARIES)[number]

export const KYC_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'] as const

export const ROLES = [
  'CUSTOMER',
  'MALL_ADMIN',
  'CINEMA_MANAGER',
  'STORE_MANAGER',
  'KITCHEN_STAFF',
  'RUNNER',
] as const
export type Role = (typeof ROLES)[number]

export const REFUND_REASONS = ['WRONG_ITEM', 'NEVER_DELIVERED', 'PARTIAL_STORE_CANCEL', 'OTHER'] as const
export type RefundReason = (typeof REFUND_REASONS)[number]

/** Delivery/runner leg of a store ticket: READY → PICKED_UP → DELIVERED */
export const RUNNER_STATUSES = ['ASSIGNED', 'PICKED_UP', 'DELIVERED'] as const
export type RunnerStatus = (typeof RUNNER_STATUSES)[number]

export function isTicketStatus(v: unknown): v is TicketStatus {
  return typeof v === 'string' && (TICKET_STATUSES as readonly string[]).includes(v)
}

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === 'string' && (PAYMENT_METHODS as readonly string[]).includes(v)
}

export function isRefundReason(v: unknown): v is RefundReason {
  return typeof v === 'string' && (REFUND_REASONS as readonly string[]).includes(v)
}
