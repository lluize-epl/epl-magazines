import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { verifySession } from '@/lib/dal'
import { auditLog } from '@/lib/logger'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/branches/[id]/magazines
 * Returns all magazine subscriptions for a branch, including magazine details.
 * Requires any authenticated session.
 */
export async function GET(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    await verifySession()
    const { id } = await params

    const branch = await db.branch.findUnique({ where: { id } })
    if (!branch) return Response.json({ error: 'Branch not found' }, { status: 404 })

    const subscriptions = await db.branchMagazine.findMany({
      where: { branchId: id, active: true },
      include: {
        magazine: {
          select: { id: true, name: true, cadence: true, active: true, notes: true },
        },
      },
      orderBy: { magazine: { name: 'asc' } },
    })

    return Response.json(subscriptions)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

interface AddMagazineBody {
  magazineId: string
  quantity?: number
}

/**
 * POST /api/branches/[id]/magazines
 * Adds a magazine subscription to a branch. ADMIN only.
 * Body: { magazineId: string, quantity?: number }
 */
export async function POST(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const session = await verifySession()
    if (session.role !== 'ADMIN') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const { magazineId, quantity = 1 } = (await request.json()) as AddMagazineBody

    if (!magazineId) {
      return Response.json({ error: 'magazineId is required' }, { status: 400 })
    }

    const branch = await db.branch.findUnique({ where: { id } })
    if (!branch) return Response.json({ error: 'Branch not found' }, { status: 404 })

    const magazine = await db.magazine.findUnique({ where: { id: magazineId } })
    if (!magazine) return Response.json({ error: 'Magazine not found' }, { status: 404 })

    const subscription = await db.branchMagazine.upsert({
      where: { branchId_magazineId: { branchId: id, magazineId } },
      update: { active: true, quantity },
      create: { branchId: id, magazineId, quantity },
    })

    auditLog(session.userId, 'BRANCH_MAGAZINE_ADDED', {
      branchId: id,
      branchName: branch.name,
      magazineId,
      magazineName: magazine.name,
      quantity,
    })

    return Response.json(subscription, { status: 201 })
  } catch (err) {
    console.error('Add branch magazine error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
