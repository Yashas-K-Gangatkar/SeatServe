// GET /api/onboard/qr?blockId=<cuid> — printable DOOR QR stickers for a
// block created by the campus onboarding wizard. The blockId is an
// unguessable cuid (it was returned once to the onboarder), which makes it
// the print-sheet's access key — good enough for stickers of a venue whose
// real gate is KYC + staff logins.
import QRCode from 'qrcode'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api-helpers'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const blockId = url.searchParams.get('blockId')?.trim()
  if (!blockId) return fail('Missing ?blockId=', 400)

  const block = await db.block.findUnique({
    where: { id: blockId },
    include: { classrooms: { orderBy: { name: 'asc' }, select: { id: true, name: true, doorQrToken: true } } },
  })
  if (!block) return fail('Block not found', 404)

  const origin = url.origin
  const stickers: { name: string; doorQrToken: string; target: string; dataUrl: string }[] = []
  for (const c of block.classrooms) {
    if (!c.doorQrToken) continue
    const target = `${origin}/?qr=${c.doorQrToken}`
    const dataUrl = await QRCode.toDataURL(target, {
      errorCorrectionLevel: 'M',
      margin: 1,
      scale: 8,
    })
    stickers.push({ name: c.name, doorQrToken: c.doorQrToken, target, dataUrl })
  }

  return ok({
    origin,
    campusName: (await db.campus.findFirst({ where: { blocks: { some: { id: block.id } } }, select: { name: true } }))?.name ?? '',
    blockName: block.name,
    stickers,
  })
}
