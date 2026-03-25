'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { format } from 'date-fns'
import type { TransferWithDetails, TransferStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Filter, XCircle } from 'lucide-react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import DeleteConfirmDialog from './DeleteConfirmDialog'

/** Props for the admin transfers management client component. */
export interface AdminTransfersClientProps {
  /** List of transfers with related details (magazine, branches, users). */
  transfers: TransferWithDetails[]
  /** Currently active status filter, or 'ALL' for no filter. */
  currentFilter: TransferStatus | 'ALL'
}

/** Badge colour tokens keyed by transfer status. */
const STATUS_COLORS: Record<TransferStatus, { bg: string; color: string; border: string }> = {
  PENDING: {
    bg: 'oklch(0.55 0.15 78 / 0.10)',
    color: 'oklch(0.50 0.15 78)',
    border: 'oklch(0.55 0.15 78 / 0.25)',
  },
  COMPLETED: {
    bg: 'oklch(0.45 0.10 155 / 0.10)',
    color: 'oklch(0.40 0.10 155)',
    border: 'oklch(0.45 0.10 155 / 0.25)',
  },
  CANCELLED: {
    bg: 'oklch(0.56 0.225 27 / 0.10)',
    color: 'oklch(0.50 0.20 27)',
    border: 'oklch(0.56 0.225 27 / 0.25)',
  },
}

/** Available filter pill options shown above the transfers table. */
const FILTER_OPTIONS: { value: TransferStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

/**
 * Format a date value for display in the table.
 * @param date - Date, ISO string, or null
 * @returns Formatted string like "Mar 20, 2026 14:30" or an em-dash for null
 */
function fmt(date: Date | string | null): string {
  return date ? format(new Date(date), 'MMM d, yyyy HH:mm') : '—'
}

/**
 * Client component for the admin transfers page.
 * Renders a filter bar and a table of transfers with cancel actions for pending items.
 */
export default function AdminTransfersClient({ transfers, currentFilter }: AdminTransfersClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<TransferWithDetails | null>(null)

  /** Push a new URL with the selected status filter (or clear it for 'ALL'). */
  function applyFilter(value: string) {
    const params = new URLSearchParams()
    if (value !== 'ALL') params.set('status', value)
    router.push(`${pathname}?${params.toString()}`)
  }

  /** Cancel a pending transfer via the API and refresh the page data. */
  async function handleCancel(id: string) {
    setCancellingId(id)
    try {
      const res = await fetch(`/api/transfers/${id}/cancel`, { method: 'PUT' })
      if (res.ok) {
        toast.success('Transfer cancelled')
        router.refresh()
      } else {
        const data = (await res.json()) as { error?: string }
        toast.error(data.error || 'Failed to cancel transfer')
      }
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <>
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        <Filter size={14} style={{ color: 'oklch(0.55 0.030 72)' }} />
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => applyFilter(opt.value)}
            className="px-3 py-1.5 rounded-full text-xs font-medium transition-all border"
            style={{
              backgroundColor: currentFilter === opt.value
                ? 'oklch(0.38 0.082 156)'
                : 'oklch(0.978 0.009 88)',
              color: currentFilter === opt.value
                ? 'oklch(0.978 0.009 88)'
                : 'oklch(0.45 0.035 72)',
              borderColor: currentFilter === opt.value
                ? 'oklch(0.38 0.082 156)'
                : 'oklch(0.876 0.016 88)',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {transfers.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'oklch(0.60 0.025 72)' }}>
          <p className="text-lg font-medium" style={{ fontFamily: 'var(--font-playfair)' }}>
            No transfers found
          </p>
        </div>
      ) : (
        <div
          className="rounded-lg border overflow-hidden"
          style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.978 0.009 88)' }}
        >
          <Table>
            <TableHeader>
              <TableRow style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.963 0.012 91)' }}>
                {['Magazine', 'From', 'To', 'Qty', 'Status', 'Initiated By', 'Date', 'Actions'].map((h) => (
                  <TableHead
                    key={h}
                    className={`font-semibold ${h === 'Actions' ? 'text-right' : ''}`}
                    style={{ color: 'oklch(0.30 0.028 62)' }}
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((t) => {
                const statusStyle = STATUS_COLORS[t.status]
                return (
                  <TableRow
                    key={t.id}
                    className="hover:bg-black/[0.02] transition-colors"
                    style={{ borderColor: 'oklch(0.900 0.012 88)' }}
                  >
                    <TableCell>
                      <Link
                        href={`/magazines/${t.magazineId}`}
                        className="font-medium hover:underline cursor-pointer"
                        style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
                      >
                        {t.magazine.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm" style={{ color: 'oklch(0.35 0.028 62)' }}>
                        {t.fromBranch.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm" style={{ color: 'oklch(0.35 0.028 62)' }}>
                        {t.toBranch.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-semibold" style={{ color: 'oklch(0.20 0.028 62)' }}>
                        {t.quantity}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-xs"
                        style={{
                          backgroundColor: statusStyle.bg,
                          color: statusStyle.color,
                          borderColor: statusStyle.border,
                        }}
                      >
                        {t.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm" style={{ color: 'oklch(0.45 0.028 62)' }}>
                        {t.initiatedBy.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
                        {fmt(t.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {t.status === 'PENDING' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => setCancelTarget(t)}
                          disabled={cancellingId === t.id}
                          style={{ color: 'oklch(0.56 0.225 27)', borderColor: 'oklch(0.56 0.225 27 / 0.3)' }}
                        >
                          <XCircle size={12} /> {cancellingId === t.id ? 'Cancelling...' : 'Cancel'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {cancelTarget && (
        <DeleteConfirmDialog
          open={!!cancelTarget}
          onOpenChange={(v) => { if (!v) setCancelTarget(null) }}
          title={`Cancel transfer of "${cancelTarget.magazine.name}"?`}
          description={`This will cancel the pending transfer of ${cancelTarget.quantity} ${cancelTarget.quantity === 1 ? 'copy' : 'copies'} from ${cancelTarget.fromBranch.name} to ${cancelTarget.toBranch.name}.`}
          onConfirm={async () => {
            await handleCancel(cancelTarget.id)
            setCancelTarget(null)
          }}
          confirmLabel="Cancel Transfer"
          loadingLabel="Cancelling…"
        />
      )}
    </>
  )
}
