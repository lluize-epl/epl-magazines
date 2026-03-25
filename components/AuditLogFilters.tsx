'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface AuditLogFiltersProps {
  /** Distinct action types found in all logs */
  actions: string[]
  /** Distinct users found in all logs: { id, name } */
  users: { id: string; name: string }[]
}

/** Action scope groupings for the dropdown */
const ACTION_SCOPES: { label: string; actions: string[] }[] = [
  { label: 'Auth', actions: ['LOGIN', 'LOGOUT'] },
  { label: 'Magazines', actions: ['MAGAZINE_CREATED', 'MAGAZINE_UPDATED', 'MAGAZINE_DELETED'] },
  { label: 'Receipts', actions: ['RECEIPT_CREATED', 'RECEIPT_EDITED'] },
  { label: 'Users', actions: ['USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'USER_NAME_CHANGED', 'USER_PASSWORD_CHANGED'] },
  { label: 'Branches', actions: ['BRANCH_MAGAZINE_ADDED', 'BRANCH_MAGAZINE_UPDATED', 'BRANCH_MAGAZINE_REMOVED'] },
  { label: 'Transfers', actions: ['TRANSFER_INITIATED', 'TRANSFER_COMPLETED', 'TRANSFER_CANCELLED'] },
  { label: 'Reports', actions: ['REPORT_EXPORTED'] },
]

export default function AuditLogFilters({ actions, users }: AuditLogFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentAction = searchParams.get('action') ?? ''
  const currentUser = searchParams.get('user') ?? ''
  const currentFrom = searchParams.get('from') ?? ''
  const currentTo = searchParams.get('to') ?? ''

  const hasFilters = currentAction || currentUser || currentFrom || currentTo

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    // Reset to page 1 when filter changes
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  function clearAll() {
    router.push(pathname)
  }

  // Build grouped action options — only show actions that exist in logs
  const actionSet = new Set(actions)

  const selectStyle = {
    backgroundColor: 'oklch(0.978 0.009 88)',
    borderColor: 'oklch(0.876 0.016 88)',
    color: 'oklch(0.30 0.028 62)',
  }

  return (
    <div
      className="flex items-end gap-3 flex-wrap mb-6 p-4 rounded-lg border"
      style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.985 0.005 88)' }}
    >
      <Filter size={14} className="mb-2.5 flex-shrink-0" style={{ color: 'oklch(0.55 0.030 72)' }} />

      {/* Action filter */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium" style={{ color: 'oklch(0.50 0.035 72)' }}>
          Action
        </label>
        <select
          value={currentAction}
          onChange={(e) => updateParam('action', e.target.value)}
          className="h-8 px-2 pr-7 rounded-md border text-xs appearance-none cursor-pointer"
          style={selectStyle}
        >
          <option value="">All actions</option>
          {ACTION_SCOPES.map((scope) => {
            const available = scope.actions.filter((a) => actionSet.has(a))
            if (available.length === 0) return null
            return (
              <optgroup key={scope.label} label={scope.label}>
                {available.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </optgroup>
            )
          })}
        </select>
      </div>

      {/* User filter */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium" style={{ color: 'oklch(0.50 0.035 72)' }}>
          User
        </label>
        <select
          value={currentUser}
          onChange={(e) => updateParam('user', e.target.value)}
          className="h-8 px-2 pr-7 rounded-md border text-xs appearance-none cursor-pointer"
          style={selectStyle}
        >
          <option value="">All users</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      {/* Date from */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium" style={{ color: 'oklch(0.50 0.035 72)' }}>
          From
        </label>
        <input
          type="date"
          value={currentFrom}
          onChange={(e) => updateParam('from', e.target.value)}
          className="h-8 px-2 rounded-md border text-xs cursor-pointer"
          style={selectStyle}
        />
      </div>

      {/* Date to */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium" style={{ color: 'oklch(0.50 0.035 72)' }}>
          To
        </label>
        <input
          type="date"
          value={currentTo}
          onChange={(e) => updateParam('to', e.target.value)}
          className="h-8 px-2 rounded-md border text-xs cursor-pointer"
          style={selectStyle}
        />
      </div>

      {/* Clear button */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs mb-0"
          onClick={clearAll}
          style={{ color: 'oklch(0.50 0.035 72)' }}
        >
          <X size={12} /> Clear
        </Button>
      )}
    </div>
  )
}
