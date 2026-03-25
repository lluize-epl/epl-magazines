import db from '@/lib/db'
import fs from 'fs/promises'
import path from 'path'

const logsDir = path.join(process.cwd(), 'logs')

/**
 * GET /api/health
 * Returns 200 if the database is reachable and the audit log directory is writable.
 * Returns 503 with error details if either check fails.
 * Unauthenticated — used by Docker HEALTHCHECK.
 */
export async function GET(): Promise<Response> {
  const errors: string[] = []

  // Check 1: Database reachability
  try {
    await db.$queryRaw`SELECT 1`
  } catch {
    errors.push('Database unreachable')
  }

  // Check 2: Audit log directory writable
  try {
    await fs.access(logsDir, fs.constants.W_OK)
  } catch {
    errors.push('Audit log directory not writable')
  }

  if (errors.length > 0) {
    return Response.json({ status: 'unhealthy', errors }, { status: 503 })
  }

  return Response.json({ status: 'healthy' })
}
