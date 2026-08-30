// SeatServe — webhook signing, verification & id generation
import { describe, test, expect } from 'bun:test'
import { signPayload, verifySignature } from '../src/lib/webhook-sig'
import { generateOrderCode, generateTicketCode, generatePaymentRef, generateEventId } from '../src/lib/ids'

describe('webhook signatures (HMAC-SHA256, timing-safe compare)', () => {
  const SECRET = 'test-secret'
  const BODY = JSON.stringify({ eventId: 'evt_1', type: 'payment.captured', providerRef: 'pay_1' })

  test('valid signature passes', () => {
    const sig = signPayload(BODY, SECRET)
    expect(verifySignature(BODY, sig, SECRET)).toBe(true)
  })

  test('tampered body fails', () => {
    const sig = signPayload(BODY, SECRET)
    expect(verifySignature(BODY.replace('captured', 'failed'), sig, SECRET)).toBe(false)
  })

  test('wrong secret fails', () => {
    const sig = signPayload(BODY, SECRET)
    expect(verifySignature(BODY, sig, 'other-secret')).toBe(false)
  })

  test('empty/garbage signature fails without throwing', () => {
    expect(verifySignature(BODY, '', SECRET)).toBe(false)
    expect(verifySignature(BODY, 'zzzz', SECRET)).toBe(false)
    expect(verifySignature(BODY, 'x'.repeat(9999), SECRET)).toBe(false)
  })
})

describe('human-safe identifiers', () => {
  test('order code format SS-XXXXXX, unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateOrderCode()).toMatch(/^SS-[A-HJ-NP-Z2-9]{6}$/)
    }
  })
  test('ticket, payment ref, event id formats', () => {
    expect(generateTicketCode()).toMatch(/^TKT-[A-HJ-NP-Z2-9]{6}$/)
    expect(generatePaymentRef()).toMatch(/^pay_mock_[a-hj-np-z2-9]{14}$/)
    expect(generateEventId()).toMatch(/^evt_mock_/)
  })
  test('order codes are effectively unique', () => {
    const set = new Set(Array.from({ length: 2000 }, generateOrderCode))
    expect(set.size).toBe(2000)
  })
})
