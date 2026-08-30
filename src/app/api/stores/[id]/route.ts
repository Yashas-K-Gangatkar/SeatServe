// PATCH /api/stores/[id] — demo store controls (open/close). Phase 2: STORE_MANAGER role gate.
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody } from '@/lib/api-helpers'
import { audit } from '@/lib/audit'
import { emitToRooms } from '@/lib/realtime'

const bodySchema = z.object({
  isOpen: z.boolean().optional(),
  actorRole: z.string().default('STORE_MANAGER'),
  actorRef: z.string().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = await parseBody(request, bodySchema)
  if ('error' in parsed) return parsed.error

  const store = await db.store.findUnique({ where: { id } })
  if (!store) return fail('Store not found', 404)

  if (parsed.data.isOpen !== undefined) {
    await db.store.update({ where: { id }, data: { isOpen: parsed.data.isOpen } })
    await audit({
      actorRole: parsed.data.actorRole,
      actorRef: parsed.data.actorRef ?? store.name,
      action: parsed.data.isOpen ? 'STORE_OPENED' : 'STORE_CLOSED',
      entityType: 'Store',
      entityId: id,
      meta: { name: store.name },
    })
    await emitToRooms({ rooms: ['admin'], event: 'store:update', data: { storeId: id, isOpen: parsed.data.isOpen } })
  }

  const updated = await db.store.findUnique({ where: { id } })
  return ok({ id, isOpen: updated?.isOpen })
}
