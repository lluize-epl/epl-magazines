import { cookies } from 'next/headers'
import db from './db'
import type { Branch } from '@/types'

const BRANCH_COOKIE = 'epl-active-branch'

/**
 * Reads the active branch ID from the cookie.
 * Returns null if no branch is selected or the cookie is missing.
 */
export async function getActiveBranchId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(BRANCH_COOKIE)?.value ?? null
}

/**
 * Returns all active branches from the database.
 * Used by server components that need the branch list (e.g., Sidebar).
 */
export async function getActiveBranches(): Promise<Branch[]> {
  const branches = await db.branch.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true, active: true, createdAt: true },
  })
  return branches as Branch[]
}

/**
 * Resolves the active branch. If cookie is set and valid, returns that branch ID.
 * If cookie is missing or invalid, defaults to Main Library (code='MAIN').
 */
export async function resolveActiveBranchId(): Promise<string> {
  const cookieBranchId = await getActiveBranchId()

  if (cookieBranchId) {
    const branch = await db.branch.findUnique({
      where: { id: cookieBranchId, active: true },
      select: { id: true },
    })
    if (branch) return branch.id
  }

  // Fallback: Main Library (code='MAIN'). If Main doesn't exist, fall back to any active branch.
  const fallback = await db.branch.findFirst({
    where: { active: true, code: 'MAIN' },
    select: { id: true },
  }) ?? await db.branch.findFirst({
    where: { active: true },
    select: { id: true },
  })

  if (!fallback) throw new Error('No active branches in database')
  return fallback.id
}

export { BRANCH_COOKIE }
