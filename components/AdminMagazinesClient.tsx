'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { toLocalDate } from '@/lib/utils'
import type { BranchMagazineWithDetails, Branch } from '@/types'
import Link from 'next/link'
import { Plus, Pencil, Trash2, BookMarked, SendHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { CADENCE_LABELS } from '@/lib/cadence'
import CreateMagazineDialog from './CreateMagazineDialog'
import EditMagazineDialog from './EditMagazineDialog'
import DeleteConfirmDialog from './DeleteConfirmDialog'
import TransferDialog from './TransferDialog'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'

export interface AdminMagazinesClientProps {
  magazines: BranchMagazineWithDetails[]
  branchId: string
  branches: Branch[]
  search?: string
  /** Magazine IDs that have an active MagazineSubscription for the selected period */

  /** Human-readable name of the active subscription period */
}

export default function AdminMagazinesClient({ magazines, branchId, branches, search }: AdminMagazinesClientProps) {
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<BranchMagazineWithDetails | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BranchMagazineWithDetails | null>(null)
  const [transferTarget, setTransferTarget] = useState<BranchMagazineWithDetails | null>(null)
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
            {search ? 'No magazines match your search' : 'No magazines at this branch'}
          </p>
          {!search && <p className="text-sm mt-1">Click &quot;Add Magazine&quot; to subscribe one.</p>}
        </div>
      ) : (
        <div
          className="rounded-lg border overflow-hidden"
          style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.978 0.009 88)' }}
        >
          <Table>
            <TableHeader>
              <TableRow style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.963 0.012 91)' }}>
                {['Name', 'Cadence', 'Qty', 'Total Deliveries', 'Last Received', 'Next Expected', 'Notes', 'Status', 'Actions'].map((h) => (
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
                    <Link
                      href={`/magazines/${sub.magazineId}`}
                      className="font-medium hover:underline cursor-pointer"
                      style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
                    >
                      {sub.magazine.name}
                    </Link>
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
                      {toLocalDate(sub.lastReceivedDate)
                        ? format(toLocalDate(sub.lastReceivedDate)!, 'MMM d, yyyy')
                        : 'Never'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
                      {toLocalDate(sub.nextExpectedDate)
                        ? format(toLocalDate(sub.nextExpectedDate)!, 'MMM d, yyyy')
                        : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm italic" style={{ color: 'oklch(0.55 0.030 72)' }}>
                      {sub.magazine.notes || '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger render={<div className="inline-flex" />}>
                          <div
                            className="inline-flex cursor-pointer rounded-full transition-shadow hover:shadow-[0_0_8px_oklch(0.38_0.082_156_/_0.4)]"
                            onClick={() => !togglingId && toggleActive(sub)}
                          >
                            <Switch
                              checked={sub.active}
                              onCheckedChange={() => toggleActive(sub)}
                              disabled={togglingId === sub.id}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{sub.active ? 'Deactivate' : 'Activate'}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell>
                    <TooltipProvider>
                      <div className="flex items-center justify-end gap-1.5">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => setTransferTarget(sub)}
                                disabled={sub.quantity < 1}
                              />
                            }
                          >
                            <SendHorizontal size={14} style={{ color: 'oklch(0.45 0.082 156)' }} />
                          </TooltipTrigger>
                          <TooltipContent>Transfer</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => setEditTarget(sub)}
                              />
                            }
                          >
                            <Pencil size={14} style={{ color: 'oklch(0.45 0.082 156)' }} />
                          </TooltipTrigger>
                          <TooltipContent>Edit</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => setDeleteTarget(sub)}
                              />
                            }
                          >
                            <Trash2 size={14} style={{ color: 'oklch(0.56 0.225 27)' }} />
                          </TooltipTrigger>
                          <TooltipContent>Remove from branch</TooltipContent>
                        </Tooltip>
                      </div>
                    </TooltipProvider>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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

      {transferTarget && (
        <TransferDialog
          magazineName={transferTarget.magazine.name}
          magazineId={transferTarget.magazineId}
          maxQuantity={transferTarget.quantity}
          availableBranches={branches.filter(b => b.id !== branchId)}
          open={!!transferTarget}
          onOpenChange={(v) => { if (!v) setTransferTarget(null) }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}
          title={`Remove "${deleteTarget.magazine.name}"?`}
          description="This will remove the magazine subscription from this branch. Receipt history is preserved."
          confirmLabel="Remove"
          loadingLabel="Removing..."
          onConfirm={() => removeFromBranch(deleteTarget)}
        />
      )}
    </>
  )
}
