'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format } from 'date-fns'
import type { BranchMagazineWithDetails } from '@/types'
import { Plus, Pencil, Trash2, BookMarked } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { CADENCE_LABELS } from '@/lib/cadence'
import CreateMagazineDialog from './CreateMagazineDialog'
import EditMagazineDialog from './EditMagazineDialog'
import AdminMagazineDeleteDialog from './AdminMagazineDeleteDialog'

export interface AdminMagazinesClientProps {
  magazines: BranchMagazineWithDetails[]
  branchId: string
  page: number
  totalPages: number
}

export default function AdminMagazinesClient({ magazines, branchId, page, totalPages }: AdminMagazinesClientProps) {
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<BranchMagazineWithDetails | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BranchMagazineWithDetails | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  async function toggleActive(sub: BranchMagazineWithDetails) {
    setTogglingId(sub.id)
    try {
      const res = await fetch(`/api/branches/${branchId}/magazines/${sub.magazineId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !sub.active }),
      })
      if (res.ok) {
        toast.success(`${sub.magazine.name} ${sub.active ? 'deactivated' : 'activated'}`)
        router.refresh()
      } else {
        toast.error('Failed to update status')
      }
    } finally {
      setTogglingId(null)
    }
  }

  async function removeFromBranch(sub: BranchMagazineWithDetails) {
    const res = await fetch(`/api/branches/${branchId}/magazines/${sub.magazineId}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success(`${sub.magazine.name} removed from branch`)
      setDeleteTarget(null)
      router.refresh()
    } else {
      toast.error('Failed to remove subscription')
    }
  }

  async function deleteEntirely(sub: BranchMagazineWithDetails) {
    const res = await fetch(`/api/magazines/${sub.magazineId}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success(`${sub.magazine.name} deleted entirely`)
      setDeleteTarget(null)
      router.refresh()
    } else {
      const data = (await res.json()) as { error?: string }
      toast.error(data.error || 'Failed to delete magazine')
    }
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button
          onClick={() => setCreateOpen(true)}
          className="gap-2"
          style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
        >
          <Plus size={16} /> Add Magazine
        </Button>
      </div>

      {magazines.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'oklch(0.60 0.025 72)' }}>
          <BookMarked size={40} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium" style={{ fontFamily: 'var(--font-playfair)' }}>
            No magazines at this branch
          </p>
          <p className="text-sm mt-1">Click &quot;Add Magazine&quot; to subscribe one.</p>
        </div>
      ) : (
        <div
          className="rounded-lg border overflow-hidden"
          style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.978 0.009 88)' }}
        >
          <Table>
            <TableHeader>
              <TableRow style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.963 0.012 91)' }}>
                {['Name', 'Cadence', 'Qty', 'Total Issues', 'Last Received', 'Next Expected', 'Status', 'Notes', 'Actions'].map((h) => (
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
              {magazines.map((sub) => (
                <TableRow
                  key={sub.id}
                  className="hover:bg-black/[0.02] transition-colors"
                  style={{
                    borderColor: 'oklch(0.900 0.012 88)',
                    opacity: sub.active ? 1 : 0.55,
                  }}
                >
                  <TableCell>
                    <span
                      className="font-medium"
                      style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
                    >
                      {sub.magazine.name}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="text-xs"
                      style={{
                        backgroundColor: 'oklch(0.38 0.082 156 / 0.08)',
                        color: 'oklch(0.38 0.082 156)',
                        borderColor: 'oklch(0.38 0.082 156 / 0.20)',
                      }}
                    >
                      {CADENCE_LABELS[sub.magazine.cadence]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm" style={{ color: 'oklch(0.40 0.028 62)' }}>
                      {sub.quantity}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm" style={{ color: 'oklch(0.40 0.028 62)' }}>
                      {sub.totalIssues}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
                      {sub.lastReceivedDate
                        ? format(new Date(sub.lastReceivedDate), 'MMM d, yyyy')
                        : 'Never'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
                      {sub.nextExpectedDate
                        ? format(new Date(sub.nextExpectedDate), 'MMM d, yyyy')
                        : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={sub.active}
                      onCheckedChange={() => toggleActive(sub)}
                      disabled={togglingId === sub.id}
                    />
                  </TableCell>
                  <TableCell>
                    <span className="text-sm italic" style={{ color: 'oklch(0.55 0.030 72)' }}>
                      {sub.magazine.notes || '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => setEditTarget(sub)}
                        title="Edit"
                      >
                        <Pencil size={14} style={{ color: 'oklch(0.45 0.082 156)' }} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => setDeleteTarget(sub)}
                        title="Delete"
                      >
                        <Trash2 size={14} style={{ color: 'oklch(0.56 0.225 27)' }} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
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

      <CreateMagazineDialog open={createOpen} onOpenChange={setCreateOpen} branchId={branchId} />

      {editTarget && (
        <EditMagazineDialog
          subscription={editTarget}
          branchId={branchId}
          open={!!editTarget}
          onOpenChange={(v) => { if (!v) setEditTarget(null) }}
        />
      )}

      {deleteTarget && (
        <AdminMagazineDeleteDialog
          open={!!deleteTarget}
          onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}
          magazineName={deleteTarget.magazine.name}
          onRemoveFromBranch={() => removeFromBranch(deleteTarget)}
          onDeleteEntirely={() => deleteEntirely(deleteTarget)}
        />
      )}
    </>
  )
}
