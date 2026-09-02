// SeatServe — API route helpers: consistent JSON envelopes + zod validation
import { NextResponse } from 'next/server'
import type { ZodType } from 'zod'

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status })
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status })
}

/** Turns zod paths like "products.0.pricePaise" into human phrases. */
function prettyPath(path: PropertyKey[]): string {
  const joined = path.map(String).join('.')
  const menuItem = joined.match(/^products\.(\d+)\.(.+)$/)
  if (menuItem) {
    const field = menuItem[2] === 'pricePaise' ? 'price' : menuItem[2]
    return `Menu item ${Number(menuItem[1]) + 1} ${field}`
  }
  return joined || 'body'
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<{ data: T } | { error: NextResponse }> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return { error: fail('Request body must be valid JSON', 400) }
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    const first = result.error.issues[0]
    return {
      error: fail(`${prettyPath(first.path)}: ${first.message}`, 422, {
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      }),
    }
  }
  return { data: result.data }
}
