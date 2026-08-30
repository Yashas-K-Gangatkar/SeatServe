// SeatServe — human-friendly identifiers

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I confusion

function randomCode(length: number): string {
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return out
}

export function generateOrderCode(): string {
  return `SS-${randomCode(6)}`
}

export function generateTicketCode(): string {
  return `TKT-${randomCode(6)}`
}

export function generatePaymentRef(): string {
  return `pay_mock_${randomCode(14).toLowerCase()}`
}

export function generateEventId(): string {
  return `evt_mock_${Date.now().toString(36)}${randomCode(8).toLowerCase()}`
}

export function generateQrToken(): string {
  return randomCode(10)
}
