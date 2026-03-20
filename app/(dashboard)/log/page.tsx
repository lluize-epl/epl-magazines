import type { Metadata } from 'next'
import type { AuditAction, AuditLogEntry } from '@/types'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/dal'
import db from '@/lib/db'
import { format } from 'date-fns'
import fs from 'fs'
import path from 'path'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ScrollText } from 'lucide-react'

export const metadata: Metadata = { title: 'Audit Log — EPL Magazine Tracker' }

const PAGE_SIZE = 50

const ACTION_STYLES: Partial<Record<AuditAction, { bg: string; color: string }>> = {
  LOGIN:             { bg: 'oklch(0.92 0.050 155)', color: 'oklch(0.38 0.082 156)' },
  LOGOUT:            { bg: 'oklch(0.93 0.010 88)', color: 'oklch(0.50 0.035 72)' },
  MAGAZINE_CREATED:  { bg: 'oklch(0.92 0.05 155)', color: 'oklch(0.35 0.082 156)' },
  MAGAZINE_UPDATED:  { bg: 'oklch(0.95 0.06 85)', color: 'oklch(0.45 0.15 78)' },
  MAGAZINE_DELETED:  { bg: 'oklch(0.93 0.04 27)', color: 'oklch(0.40 0.18 27)' },
  RECEIPT_CREATED:   { bg: 'oklch(0.92 0.050 155)', color: 'oklch(0.38 0.082 156)' },
  USER_CREATED:      { bg: 'oklch(0.95 0.06 85)', color: 'oklch(0.45 0.15 78)' },
  USER_DELETED:      { bg: 'oklch(0.93 0.04 27)', color: 'oklch(0.40 0.18 27)' },
  USER_UPDATED:      { bg: 'oklch(0.93 0.010 88)', color: 'oklch(0.50 0.035 72)' },
}

const DEFAULT_STYLE = { bg: 'oklch(0.93 0.010 88)', color: 'oklch(0.50 0.035 72)' }

function getActionStyle(action: string): { bg: string; color: string } {
  return ACTION_STYLES[action as AuditAction] ?? DEFAULT_STYLE
}

function readLogs(): AuditLogEntry[] {
  const logPath = path.join(process.cwd(), 'logs', 'audit.log')
  if (!fs.existsSync(logPath)) return []
  try {
    const content = fs.readFileSync(logPath, 'utf8')
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          const raw = JSON.parse(line) as Record<string, unknown>
          // Winston may nest the payload under `message` when called with an object
          if (raw.message && typeof raw.message === 'object') {
            const { message, ...rest } = raw
            return { ...rest, ...(message as Record<string, unknown>) } as AuditLogEntry
          }
          return raw as AuditLogEntry
        } catch { return null }
      })
      .filter((entry): entry is AuditLogEntry => entry !== null)
      .reverse()
  } catch {
    return []
  }
}

type SearchParams = { [key: string]: string | string[] | undefined }

interface PageProps {
  searchParams: Promise<SearchParams>
}

export default async function LogPage({ searchParams }: PageProps) {
  const user = await getUser()
  if (user.role !== 'ADMIN') redirect('/dashboard')

  const params = await searchParams
  const page = Math.max(1, parseInt((typeof params?.page === 'string' ? params.page : undefined) || '1', 10))
  const allLogs = readLogs()
  const total = allLogs.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const logs = allLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Resolve user names for visible log entries
  const userIds = [...new Set(logs.map((e) => e.userId).filter(Boolean))]
  const users = userIds.length > 0
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : []
  const userNameMap = new Map(users.map((u) => [u.id, u.name]))

  // Resolve magazine names for visible log entries
  const magazineIds = [...new Set(
    logs.flatMap((e) => [e.magazineId as string | undefined]).filter(Boolean)
  )] as string[]
  const magazines = magazineIds.length > 0
    ? await db.magazine.findMany({ where: { id: { in: magazineIds } }, select: { id: true, name: true } })
    : []
  const magazineNameMap = new Map(magazines.map((m) => [m.id, m.name]))

  // Resolve branch names for visible log entries
  const branchIds = [...new Set(
    logs.flatMap((e) => [e.branchId as string | undefined]).filter(Boolean)
  )] as string[]
  const branchesForLog = branchIds.length > 0
    ? await db.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } })
    : []
  const branchNameMap = new Map(branchesForLog.map((b) => [b.id, b.name]))

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1
          className="text-3xl font-bold mb-1"
          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
        >
          Audit Log
        </h1>
        <p style={{ color: 'oklch(0.50 0.035 72)' }}>
          {total} event{total !== 1 ? 's' : ''} recorded
          {totalPages > 1 && ` · Page ${page} of ${totalPages}`}
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'oklch(0.60 0.025 72)' }}>
          <ScrollText size={40} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium" style={{ fontFamily: 'var(--font-playfair)' }}>
            No events yet
          </p>
          <p className="text-sm mt-1">Actions will appear here as staff use the system.</p>
        </div>
      ) : (
        <>
          <div
            className="rounded-lg border overflow-hidden mb-6"
            style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.978 0.009 88)' }}
          >
            <Table>
              <TableHeader>
                <TableRow style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.963 0.012 91)' }}>
                  {['Timestamp', 'Action', 'User', 'Details'].map((h) => (
                    <TableHead key={h} className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((entry, idx) => {
                  const { timestamp, userId, action, level: _level, ...details } = entry
                  const actionStyle = getActionStyle(action)
                  const detailStr = Object.entries(details)
                    .filter(([k]) => !k.endsWith('Id'))
                    .map(([k, v]) => {
                      if (k === 'magazineName') return `magazine: ${v}`
                      if (k === 'branchName') return `branch: ${v}`
                      return `${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : v}`
                    })
                    .join('  ·  ')

                  // Resolve any remaining IDs that have name maps
                  const resolvedParts: string[] = []
                  if (details.magazineId && !details.magazineName) {
                    const name = magazineNameMap.get(details.magazineId as string)
                    if (name) resolvedParts.push(`magazine: ${name}`)
                  }
                  if (details.branchId && !details.branchName) {
                    const name = branchNameMap.get(details.branchId as string)
                    if (name) resolvedParts.push(`branch: ${name}`)
                  }
                  const fullDetails = [...resolvedParts, detailStr].filter(Boolean).join('  ·  ')

                  return (
                    <TableRow
                      key={idx}
                      className="hover:bg-black/[0.02] transition-colors"
                      style={{ borderColor: 'oklch(0.900 0.012 88)' }}
                    >
                      <TableCell>
                        <span className="text-xs font-mono" style={{ color: 'oklch(0.45 0.025 72)' }}>
                          {timestamp ? format(new Date(timestamp), 'yyyy-MM-dd HH:mm:ss') : '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-xs font-mono font-medium"
                          style={{ backgroundColor: actionStyle.bg, color: actionStyle.color, border: 'none' }}
                        >
                          {action || '—'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
                          {userId ? userNameMap.get(userId) ?? userId.slice(0, 12) + '…' : '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs" style={{ color: 'oklch(0.45 0.030 72)' }}>
                          {fullDetails || '—'}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              {page > 1 && (
                <a
                  href={`?page=${page - 1}`}
                  className="px-4 py-2 rounded-md text-sm border transition-colors hover:bg-black/[0.04]"
                  style={{ borderColor: 'oklch(0.876 0.016 88)', color: 'oklch(0.38 0.082 156)' }}
                >
                  ← Previous
                </a>
              )}
              <span className="text-sm" style={{ color: 'oklch(0.50 0.035 72)' }}>
                {page} / {totalPages}
              </span>
              {page < totalPages && (
                <a
                  href={`?page=${page + 1}`}
                  className="px-4 py-2 rounded-md text-sm border transition-colors hover:bg-black/[0.04]"
                  style={{ borderColor: 'oklch(0.876 0.016 88)', color: 'oklch(0.38 0.082 156)' }}
                >
                  Next →
                </a>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
