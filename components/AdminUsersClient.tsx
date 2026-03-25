'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format } from 'date-fns'
import type { AdminUser } from '@/types'
import { Plus, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import CreateUserDialog from './CreateUserDialog'
import DeleteConfirmDialog from './DeleteConfirmDialog'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'

export interface AdminUsersClientProps {
  users: AdminUser[]
  currentUserId: string
  search?: string
}

export default function AdminUsersClient({ users, currentUserId, search }: AdminUsersClientProps) {
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<AdminUser | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function toggleActive(user: AdminUser) {
    // Deactivation requires confirmation; reactivation is immediate
    if (user.active) {
      setDeactivateTarget(user)
      return
    }
    await performToggle(user)
  }

  async function performToggle(user: AdminUser) {
    setTogglingId(user.id)
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !user.active }),
      })
      if (res.ok) {
        toast.success(`${user.name} ${user.active ? 'deactivated' : 'activated'}`)
        setDeactivateTarget(null)
        router.refresh()
      } else {
        toast.error('Failed to update user')
      }
    } finally {
      setTogglingId(null)
    }
  }

  async function deleteUser(user: AdminUser) {
    setDeletingId(user.id)
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success(`${user.name} deleted`)
        setDeleteTarget(null)
        router.refresh()
      } else {
        const data = (await res.json()) as { error?: string }
        toast.error(data.error || 'Failed to delete user')
      }
    } finally {
      setDeletingId(null)
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
          <Plus size={16} /> Add User
        </Button>
      </div>

      {users.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'oklch(0.60 0.025 72)' }}>
          <Users size={40} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium" style={{ fontFamily: 'var(--font-playfair)' }}>
            {search ? 'No users match your search' : 'No users yet'}
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
                {['Name', 'Email', 'Role', 'Receipts', 'Joined', 'Actions'].map((h) => (
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
              {users.map((user) => (
                <TableRow
                  key={user.id}
                  className="hover:bg-black/[0.02] transition-colors"
                  style={{ borderColor: 'oklch(0.900 0.012 88)' }}
                >
                  <TableCell style={{ opacity: user.active ? 1 : 0.55 }}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{
                          backgroundColor: 'oklch(0.38 0.082 156 / 0.12)',
                          color: 'oklch(0.38 0.082 156)',
                        }}
                      >
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <span
                        className="font-medium"
                        style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
                      >
                        {user.name}
                        {user.id === currentUserId && (
                          <span className="text-xs ml-1.5" style={{ color: 'oklch(0.55 0.030 72)' }}>(you)</span>
                        )}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell style={{ opacity: user.active ? 1 : 0.55 }}>
                    <span className="text-sm" style={{ color: 'oklch(0.40 0.028 62)' }}>{user.email}</span>
                  </TableCell>
                  <TableCell style={{ opacity: user.active ? 1 : 0.55 }}>
                    <Badge
                      variant="outline"
                      className="text-xs font-medium"
                      style={
                        user.role === 'ADMIN'
                          ? { backgroundColor: 'oklch(0.95 0.06 85)', color: 'oklch(0.45 0.15 78)', border: 'none' }
                          : { backgroundColor: 'oklch(0.92 0.050 155)', color: 'oklch(0.38 0.082 156)', border: 'none' }
                      }
                    >
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell style={{ opacity: user.active ? 1 : 0.55 }}>
                    <span className="text-sm" style={{ color: 'oklch(0.40 0.028 62)' }}>
                      {user._count.receipts}
                    </span>
                  </TableCell>
                  <TableCell style={{ opacity: user.active ? 1 : 0.55 }}>
                    <span className="text-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
                      {format(new Date(user.createdAt), 'MMM d, yyyy')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5">
                      {user.id !== currentUserId && (
                        <TooltipProvider>
                          <Switch
                            checked={user.active}
                            onCheckedChange={() => toggleActive(user)}
                            disabled={togglingId === user.id}
                          />
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  onClick={() => setDeleteTarget(user)}
                                  disabled={deletingId === user.id}
                                />
                              }
                            >
                              <Trash2 size={14} style={{ color: 'oklch(0.56 0.225 27)' }} />
                            </TooltipTrigger>
                            <TooltipContent>Delete</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />

      {deleteTarget && (
        <DeleteConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}
          title={`Delete "${deleteTarget.name}"?`}
          description={`This will permanently delete the user account. Their ${deleteTarget._count?.receipts ?? 0} receipt records will remain.`}
          onConfirm={() => deleteUser(deleteTarget)}
        />
      )}

      {deactivateTarget && (
        <DeleteConfirmDialog
          open={!!deactivateTarget}
          onOpenChange={(v) => { if (!v) setDeactivateTarget(null) }}
          title={`Deactivate "${deactivateTarget.name}"?`}
          description="This user will no longer be able to log in. You can reactivate them later."
          onConfirm={() => performToggle(deactivateTarget)}
          confirmLabel="Deactivate"
          loadingLabel="Deactivating…"
        />
      )}
    </>
  )
}
