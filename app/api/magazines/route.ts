import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { withRetry } from '@/lib/db-retry'
import { verifySessionForApi } from '@/lib/dal'
import { auditLog } from '@/lib/logger'
import { createMagazineSchema } from '@/lib/validations'

/**
 * GET /api/magazines
 * Returns all active magazines ordered by name. Requires any authenticated session.
 */
export async function GET(): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const magazines = await db.magazine.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    })
    return Response.json(magazines)
  } catch (err) {
    console.error('List magazines error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/magazines
 * Creates a new magazine. ADMIN only. Body: { name, cadence, language?, notes?, branches: [{ branchId, quantity }] }.
 * Returns 201 with the created magazine, or 400/403 on validation/auth failure.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const body = await request.json()
    const parsed = createMagazineSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { name, cadence, language, notes, branches } = parsed.data

    /** Normalize language: "hindi" → "Hindi", "GUJARATI" → "Gujarati" */
    const normalizedLanguage = language?.trim()
      ? language.trim().charAt(0).toUpperCase() + language.trim().slice(1).toLowerCase()
      : 'English'

    // Dedup: block an exact (name + language) duplicate among ACTIVE magazines.
    // SQLite `equals` is case-sensitive, so compare case-insensitively in JS over the
    // (small) set of active magazines sharing this language.
    const sameLanguage = await db.magazine.findMany({
      where: { active: true, language: normalizedLanguage },
      select: { id: true, name: true },
    })
    if (sameLanguage.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      const label = normalizedLanguage !== 'English' ? `${name} - ${normalizedLanguage}` : name
      return Response.json({ error: `"${label}" already exists` }, { status: 409 })
    }

    const { magazine, branchCodes } = await withRetry(() => db.$transaction(async (tx) => {
      const mag = await tx.magazine.create({
        data: { name, cadence, language: normalizedLanguage, notes: notes?.trim() || null },
      })
      for (const b of branches) {
        await tx.branchMagazine.upsert({
          where: { branchId_magazineId: { branchId: b.branchId, magazineId: mag.id } },
          update: { quantity: b.quantity, active: true },
          create: { branchId: b.branchId, magazineId: mag.id, quantity: b.quantity },
        })
      }
      const branchRows = await tx.branch.findMany({
        where: { id: { in: branches.map((b) => b.branchId) } },
        select: { code: true },
      })
      return { magazine: mag, branchCodes: branchRows.map((r) => r.code) }
    }))

    // Audit with human-readable branch codes, never cuids.
    auditLog(session.userId, 'MAGAZINE_CREATED', {
      name: magazine.name,
      language: magazine.language,
      branches: branchCodes,
    })

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
