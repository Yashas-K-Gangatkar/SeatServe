/**
 * Auth helper for Vercel Cron endpoints.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when the env var is
 * configured on the project. Rules enforced here:
 *  - unset CRON_SECRET => endpoint is DISABLED (never accidentally open)
 *  - header must be exactly `Bearer <secret>` (case-sensitive scheme)
 *  - constant-time-ish compare (length check first, then XOR-fold)
 */

export function cronSecretMatches(expected: string | undefined, header: string | null): boolean {
  if (!expected) return false
  if (!header) return false
  const prefix = 'Bearer '
  if (!header.startsWith(prefix)) return false
  const presented = header.slice(prefix.length)
  if (presented.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ presented.charCodeAt(i)
  }
  return diff === 0
}
