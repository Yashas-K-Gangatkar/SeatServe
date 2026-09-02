import { describe, it, expect } from 'bun:test'
import { cronSecretMatches } from '../src/lib/cron-auth'

describe('cronSecretMatches', () => {
  const SECRET = 's3cr3t-token-value'

  it('accepts the exact Bearer secret', () => {
    expect(cronSecretMatches(SECRET, `Bearer ${SECRET}`)).toBe(true)
  })

  it('rejects a wrong secret', () => {
    expect(cronSecretMatches(SECRET, 'Bearer wrong-value-here')).toBe(false)
  })

  it('rejects a missing header', () => {
    expect(cronSecretMatches(SECRET, null)).toBe(false)
    expect(cronSecretMatches(SECRET, '')).toBe(false)
  })

  it('is disabled when CRON_SECRET is unset', () => {
    expect(cronSecretMatches(undefined, `Bearer ${SECRET}`)).toBe(false)
    expect(cronSecretMatches('', `Bearer ${SECRET}`)).toBe(false)
  })

  it('rejects lowercase scheme and bare tokens', () => {
    expect(cronSecretMatches(SECRET, `bearer ${SECRET}`)).toBe(false)
    expect(cronSecretMatches(SECRET, SECRET)).toBe(false)
  })

  it('rejects secrets of different length', () => {
    expect(cronSecretMatches(SECRET, 'Bearer short')).toBe(false)
    expect(cronSecretMatches('short', `Bearer ${SECRET}`)).toBe(false)
  })
})
