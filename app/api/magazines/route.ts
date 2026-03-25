import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { withRetry } from '@/lib/db-retry'
import { verifySession } from '@/lib/dal'
import { auditLog } from '@/lib/logger'
import type { CadenceType } from '@/types'

interface CreateMagazineBody {
  name: string
  cadence: string
  language?: string
  notes?: string
}

const VALID_CADENCES: CadenceType[] = ['WEEKLY', 'BI_WEEKLY', 'MONTHLY', 'BI_MONTHLY', 'SEASONAL']

function isCadenceType(value: string): value is CadenceType {
  return VALID_CADENCES.includes(value as CadenceType)
}

/**
 * GET /api/magazines
 * Returns all active magazines ordered by name. Requires any authenticated session.
 */
export async function GET(): Promise<Response> {
  try {
    await verifySession()
    const magazines = await db.magazine.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    })
    return Response.json(magazines)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

/**
 * POST /api/magazines
 * Creates a new magazine. ADMIN only. Body: { name, cadence, notes? }.
 * Returns 201 with the created magazine, or 400/403 on validation/auth failure.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await verifySession()
    if (session.role !== 'ADMIN') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { name, cadence, language, notes } = (await request.json()) as CreateMagazineBody

    if (!name?.trim() || !cadence) {
      return Response.json({ error: 'Name and cadence are required' }, { status: 400 })
    }

    if (!isCadenceType(cadence)) {
      return Response.json({ error: 'Invalid cadence' }, { status: 400 })
    }

    /** Normalize language: "hindi" → "Hindi", "GUJARATI" → "Gujarati" */
    const normalizedLanguage = language?.trim()
      ? language.trim().charAt(0).toUpperCase() + language.trim().slice(1).toLowerCase()
      : 'English'

    const magazine = await withRetry(() => db.magazine.create({
      data: { name: name.trim(), cadence, language: normalizedLanguage, notes: notes?.trim() || null },
    }))

    auditLog(session.userId, 'MAGAZINE_CREATED', { name: magazine.name })
    return Response.json(magazine, { status: 201 })
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    console.error('Create magazine error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
