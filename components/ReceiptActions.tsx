'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Branch } from '@/types'

interface ReceiptData {
  id: string
  receivedDate: string
  branchId: string | null
  notes: string | null
}

export interface ReceiptActionsProps {
  receipt: ReceiptData
  magazineId: string
  branches: Branch[]
}

/** Edit/delete action buttons for a receipt row. Admin only. */
export default function ReceiptActions({ receipt, magazineId, branches }: ReceiptActionsProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  // Edit form state
  const [date, setDate] = useState(receipt.receivedDate.split('T')[0])
  const [branchId, setBranchId] = useState(receipt.branchId ?? '')
  const [notes, setNotes] = useState(receipt.notes ?? '')

  async function handleEdit() {
    setLoading(true)
    try {
      const res = await fetch(`/api/magazines/${magazineId}/receipts/${receipt.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receivedDate: date,
          branchId: branchId || undefined,
          notes: notes || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error ?? 'Failed to update receipt')
        return
      }
      setEditOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    setLoading(true)
    try {
      const res = await fetch(`/api/magazines/${magazineId}/receipts/${receipt.id}`, {
        method: 'DELETE',
      })
      if (!res.ok && res.status !== 204) {
        const data = await res.json()
        alert(data.error ?? 'Failed to delete receipt')
        return
      }
      setDeleteOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-1">
      {/* Edit button */}
      <button
        onClick={() => setEditOpen(true)}
        className="p-1.5 rounded-md transition-colors hover:bg-black/[0.06] cursor-pointer"
        title="Edit receipt"
      >
        <Pencil size={14} style={{ color: 'oklch(0.45 0.082 156)' }} />
      </button>

      {/* Delete button */}
      <button
        onClick={() => setDeleteOpen(true)}
        className="p-1.5 rounded-md transition-colors hover:bg-red-50 cursor-pointer"
        title="Delete receipt"
      >
        <Trash2 size={14} style={{ color: 'oklch(0.55 0.18 27)' }} />
      </button>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Receipt</DialogTitle>
            <DialogDescription>Update the date, branch, or notes for this receipt.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block" style={{ color: 'oklch(0.30 0.028 62)' }}>
                Date Received
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: 'oklch(0.876 0.016 88)' }}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block" style={{ color: 'oklch(0.30 0.028 62)' }}>
                Branch
              </label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: 'oklch(0.876 0.016 88)' }}
              >
                <option value="">— Select branch —</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block" style={{ color: 'oklch(0.30 0.028 62)' }}>
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: 'oklch(0.876 0.016 88)' }}
                rows={2}
                placeholder="Optional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={loading}>Cancel</Button>
            <Button onClick={handleEdit} disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Receipt</DialogTitle>
            <DialogDescription>
              Delete the receipt from {date}? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={loading}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
