export const dynamic = 'force-dynamic'

import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { getUser } from '@/lib/dal'
import { getActiveBranches, resolveActiveBranchId } from '@/lib/branch'
import { deactivateExpiredPeriods, getActivePeriods } from '@/lib/period'
import Sidebar from '@/components/Sidebar'

interface LayoutProps {
  children: ReactNode
}

export default async function DashboardLayout({ children }: LayoutProps) {
  // Auto-deactivate expired periods before fetching data
  await deactivateExpiredPeriods()

  const [user, branches, activeBranchId, activePeriods, cookieStore] = await Promise.all([
    getUser(),
    getActiveBranches(),
    resolveActiveBranchId(),
    getActivePeriods(),
    cookies(),
  ])

  const sidebarCollapsed = cookieStore.get('epl-sidebar-collapsed')?.value === 'true'

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        user={user}
        branches={branches}
        activeBranchId={activeBranchId}
        defaultCollapsed={sidebarCollapsed}
      />
      <main
        className="flex-1 overflow-y-auto transition-all duration-300"
        style={{ backgroundColor: 'oklch(0.963 0.012 91)' }}
      >
        {activePeriods.length === 0 && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-amber-800 text-sm">
            No active subscription periods. Contact an admin to create or activate one.
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
