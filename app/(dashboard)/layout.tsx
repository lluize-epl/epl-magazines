import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { getUser } from '@/lib/dal'
import { getActiveBranches, resolveActiveBranchId } from '@/lib/branch'
import { getSubscriptionPeriods, resolveActivePeriodId } from '@/lib/period'
import Sidebar from '@/components/Sidebar'

interface LayoutProps {
  children: ReactNode
}

export default async function DashboardLayout({ children }: LayoutProps) {
  const [user, branches, activeBranchId, periods, activePeriodId, cookieStore] = await Promise.all([
    getUser(),
    getActiveBranches(),
    resolveActiveBranchId(),
    getSubscriptionPeriods(),
    resolveActivePeriodId(),
    cookies(),
  ])

  const sidebarCollapsed = cookieStore.get('epl-sidebar-collapsed')?.value === 'true'

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        user={user}
        branches={branches}
        activeBranchId={activeBranchId}
        periods={periods}
        activePeriodId={activePeriodId}
        defaultCollapsed={sidebarCollapsed}
      />
      <main
        className="flex-1 overflow-y-auto transition-all duration-300"
        style={{ backgroundColor: 'oklch(0.963 0.012 91)' }}
      >
        {children}
      </main>
    </div>
  )
}
