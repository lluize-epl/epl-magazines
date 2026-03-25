import type { Metadata } from 'next'
import type { AuditAction, AuditLogEntry } from '@/types'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/dal'
import db from '@/lib/db'
import { format, parseISO, startOfDay, endOfDay } from 'date-fns'
import fs from 'fs'
import path from 'path'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ScrollText } from 'lucide-react'
import AuditLogFilters from '@/components/AuditLogFilters'

export const metadata: Metadata = { title: 'Audit Log — EPL Magazine Tracker' }

const PAGE_SIZE = 50

const ACTION_STYLES: Partial<Record<AuditAction, { bg: string; color: string }>> = {
  // Auth — slate blue (hue 250)
  LOGIN:                  { bg: 'oklch(0.93 0.03 250)', color: 'oklch(0.42 0.10 250)' },
  LOGOUT:                 { bg: 'oklch(0.93 0.03 250)', color: 'oklch(0.42 0.10 250)' },
  // Magazines — teal green (hue 155)
  MAGAZINE_CREATED:       { bg: 'oklch(0.92 0.05 155)', color: 'oklch(0.35 0.08 155)' },
  MAGAZINE_UPDATED:       { bg: 'oklch(0.92 0.05 155)', color: 'oklch(0.35 0.08 155)' },
  MAGAZINE_DELETED:       { bg: 'oklch(0.93 0.04 27)',  color: 'oklch(0.40 0.18 27)' },
  // Receipts — sky cyan (hue 200)
  RECEIPT_CREATED:        { bg: 'oklch(0.93 0.04 200)', color: 'oklch(0.38 0.10 200)' },
  RECEIPT_EDITED:         { bg: 'oklch(0.93 0.04 200)', color: 'oklch(0.38 0.10 200)' },
  // Users — violet (hue 300)
  USER_CREATED:           { bg: 'oklch(0.93 0.04 300)', color: 'oklch(0.40 0.12 300)' },
  USER_UPDATED:           { bg: 'oklch(0.93 0.04 300)', color: 'oklch(0.40 0.12 300)' },
  USER_NAME_CHANGED:      { bg: 'oklch(0.93 0.04 300)', color: 'oklch(0.40 0.12 300)' },
  USER_PASSWORD_CHANGED:  { bg: 'oklch(0.93 0.04 300)', color: 'oklch(0.40 0.12 300)' },
  USER_DELETED:           { bg: 'oklch(0.93 0.04 27)',  color: 'oklch(0.40 0.18 27)' },
  // Branches — amber (hue 65)
  BRANCH_MAGAZINE_ADDED:  { bg: 'oklch(0.94 0.05 65)',  color: 'oklch(0.42 0.12 65)' },
  BRANCH_MAGAZINE_UPDATED:{ bg: 'oklch(0.94 0.05 65)',  color: 'oklch(0.42 0.12 65)' },
  BRANCH_MAGAZINE_REMOVED:{ bg: 'oklch(0.93 0.04 27)',  color: 'oklch(0.40 0.18 27)' },
  // Transfers — indigo (hue 270)
  TRANSFER_INITIATED:     { bg: 'oklch(0.92 0.05 270)', color: 'oklch(0.38 0.14 270)' },
  TRANSFER_COMPLETED:     { bg: 'oklch(0.92 0.05 270)', color: 'oklch(0.38 0.14 270)' },
  TRANSFER_CANCELLED:     { bg: 'oklch(0.93 0.04 27)',  color: 'oklch(0.40 0.18 27)' },
  // Reports — pink/magenta (hue 330)
  REPORT_EXPORTED:        { bg: 'oklch(0.93 0.04 330)', color: 'oklch(0.40 0.12 330)' },
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

  // Read filter params
  const filterAction = typeof params?.action === 'string' ? params.action : ''
  const filterUser = typeof params?.user === 'string' ? params.user : ''
  const filterFrom = typeof params?.from === 'string' ? params.from : ''
  const filterTo = typeof params?.to === 'string' ? params.to : ''

  const allLogs = readLogs()

  // Collect distinct actions and user IDs from ALL logs (before filtering)
  const distinctActions = [...new Set(allLogs.map((e) => e.action).filter(Boolean))].sort()
  const distinctUserIds = [...new Set(allLogs.map((e) => e.userId).filter(Boolean))]

  // Resolve user names for filter dropdown
  const allLogUsers = distinctUserIds.length > 0
    ? await db.user.findMany({
        where: { id: { in: distinctUserIds } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : []

  // Apply filters
  let filtered = allLogs
  if (filterAction) {
    filtered = filtered.filter((e) => e.action === filterAction)
  }
  if (filterUser) {
    filtered = filtered.filter((e) => e.userId === filterUser)
  }
  if (filterFrom) {
    const fromDate = startOfDay(parseISO(filterFrom))
    filtered = filtered.filter((e) => e.timestamp && new Date(e.timestamp) >= fromDate)
  }
  if (filterTo) {
    const toDate = endOfDay(parseISO(filterTo))
    filtered = filtered.filter((e) => e.timestamp && new Date(e.timestamp) <= toDate)
  }

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const logs = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // Collect all IDs that may need name resolution (including nested ones)
  const allUserIds = new Set<string>()
  const allMagIds = new Set<string>()
  const allBranchIds = new Set<string>()

  for (const e of logs) {
    if (e.userId) allUserIds.add(e.userId)
    // User IDs from user management actions
    for (const k of ['targetUserId', 'newUserId', 'deletedUserId'] as const) {
      const v = (e as Record<string, unknown>)[k]
      if (typeof v === 'string') allUserIds.add(v)
    }
    if (typeof e.magazineId === 'string') allMagIds.add(e.magazineId)
    // Branch IDs: branchId, fromBranchId, toBranchId, and the `branch` field (REPORT_EXPORTED)
    for (const k of ['branchId', 'fromBranchId', 'toBranchId', 'branch'] as const) {
      const v = (e as Record<string, unknown>)[k]
      if (typeof v === 'string' && v !== 'all') allBranchIds.add(v)
    }
  }

  // Resolve user names
  const userArr = allUserIds.size > 0
    ? await db.user.findMany({ where: { id: { in: [...allUserIds] } }, select: { id: true, name: true } })
    : []
  const userNameMap = new Map(userArr.map((u) => [u.id, u.name]))

  // Resolve magazine names
  const magArr = allMagIds.size > 0
    ? await db.magazine.findMany({ where: { id: { in: [...allMagIds] } }, select: { id: true, name: true } })
    : []
  const magazineNameMap = new Map(magArr.map((m) => [m.id, m.name]))

  // Resolve branch names
  const branchArr = allBranchIds.size > 0
    ? await db.branch.findMany({ where: { id: { in: [...allBranchIds] } }, select: { id: true, name: true } })
    : []
  const branchNameMap = new Map(branchArr.map((b) => [b.id, b.name]))

  // Build pagination URL that preserves filter params
  function pageUrl(p: number): string {
    const u = new URLSearchParams()
    if (filterAction) u.set('action', filterAction)
    if (filterUser) u.set('user', filterUser)
    if (filterFrom) u.set('from', filterFrom)
    if (filterTo) u.set('to', filterTo)
    if (p > 1) u.set('page', String(p))
    const qs = u.toString()
    return `/log${qs ? `?${qs}` : ''}`
  }

  const hasFilters = filterAction || filterUser || filterFrom || filterTo

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1
          className="text-3xl font-bold mb-1"
          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
        >
          Audit Log
        </h1>
        <p style={{ color: 'oklch(0.50 0.035 72)' }}>
          {total} event{total !== 1 ? 's' : ''}
          {hasFilters ? ' matching filters' : ' recorded'}
          {totalPages > 1 && ` · Page ${currentPage} of ${totalPages}`}
        </p>
      </div>

      <AuditLogFilters actions={distinctActions} users={allLogUsers} />

      {logs.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'oklch(0.60 0.025 72)' }}>
          <ScrollText size={40} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium" style={{ fontFamily: 'var(--font-playfair)' }}>
            {hasFilters ? 'No events match your filters' : 'No events yet'}
          </p>
          <p className="text-sm mt-1">
            {hasFilters ? 'Try adjusting your filter criteria.' : 'Actions will appear here as staff use the system.'}
          </p>
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
                  // Fields to skip entirely (IDs that we resolve to names, plus internal fields)
                  const skipKeys = new Set([
                    'message',
                    // IDs — we resolve these to names below
                    'magazineId', 'branchId', 'fromBranchId', 'toBranchId',
                    'targetUserId', 'newUserId', 'deletedUserId',
                    'transferId', 'receiptId',
                    // Name fields — we render these with friendly labels below
                    'magazineName', 'branchName', 'fromBranchName', 'toBranchName',
                    'targetUserName', 'newUserName', 'deletedUserName',
                  ])

                  // Resolve names: prefer explicit *Name field, fall back to ID lookup
                  const d = details as Record<string, unknown>
                  const parts: string[] = []

                  // Magazine
                  const magName = d.magazineName as string | undefined
                    ?? magazineNameMap.get(d.magazineId as string)
                  if (magName) parts.push(`magazine: ${magName}`)

                  // Branch (single branch, or REPORT_EXPORTED `branch` field)
                  const brName = d.branchName as string | undefined
                    ?? branchNameMap.get(d.branchId as string)
                    ?? (typeof d.branch === 'string' && d.branch !== 'all'
                      ? branchNameMap.get(d.branch) ?? undefined
                      : undefined)
                  if (brName) parts.push(`branch: ${brName}`)

                  // From/To branches (transfers)
                  const fromBr = d.fromBranchName as string | undefined
                    ?? branchNameMap.get(d.fromBranchId as string)
                  const toBr = d.toBranchName as string | undefined
                    ?? branchNameMap.get(d.toBranchId as string)
                  if (fromBr) parts.push(`from: ${fromBr}`)
                  if (toBr) parts.push(`to: ${toBr}`)

                  // Target/new/deleted user
                  const targetUName = d.targetUserName as string | undefined
                    ?? userNameMap.get(d.targetUserId as string)
                  if (targetUName) parts.push(`user: ${targetUName}`)
                  const newUName = d.newUserName as string | undefined
                    ?? userNameMap.get(d.newUserId as string)
                  if (newUName) parts.push(`user: ${newUName}`)
                  const delUName = d.deletedUserName as string | undefined
                    ?? userNameMap.get(d.deletedUserId as string)
                  if (delUName) parts.push(`user: ${delUName}`)

                  // Remaining fields (changes, email, quantity, notes, etc.)
                  for (const [k, v] of Object.entries(details)) {
                    if (skipKeys.has(k)) continue
                    // Skip the `branch` field if we already resolved it above
                    if (k === 'branch' && (brName || v === 'all')) continue
                    const val = typeof v === 'object' && v !== null ? JSON.stringify(v) : v
                    parts.push(`${k}: ${val}`)
                  }

                  const fullDetails = parts.join('  ·  ')

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
              {currentPage > 1 && (
                <a
                  href={pageUrl(currentPage - 1)}
                  className="px-4 py-2 rounded-md text-sm border transition-colors hover:bg-black/[0.04]"
                  style={{ borderColor: 'oklch(0.876 0.016 88)', color: 'oklch(0.38 0.082 156)' }}
                >
                  ← Previous
                </a>
              )}
              <span className="text-sm" style={{ color: 'oklch(0.50 0.035 72)' }}>
                {currentPage} / {totalPages}
              </span>
              {currentPage < totalPages && (
                <a
                  href={pageUrl(currentPage + 1)}
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
