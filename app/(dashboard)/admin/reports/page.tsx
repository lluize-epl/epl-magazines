import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/dal'
import { getActiveBranches } from '@/lib/branch'
import { resolveActivePeriodId, getSubscriptionPeriods } from '@/lib/period'
import {
  parseReportFilters,
  getReceiptSummary,
  getOverdueReport,
  getTransferReport,
  getSubscriptionOverview,
  getReceiptTimeline,
  getAvailableLanguages,
} from '@/lib/reports'
import ReportsClient from '@/components/ReportsClient'

export const metadata: Metadata = { title: 'Reports — EPL Magazine Tracker' }

type SearchParams = { [key: string]: string | string[] | undefined }

interface PageProps {
  searchParams: Promise<SearchParams>
}

/**
 * Admin-only reports page. Parses URL searchParams into typed filters,
 * fetches only the active tab's data, and passes everything to the
 * client component for interactive filtering and display.
 */
export default async function AdminReportsPage({ searchParams }: PageProps) {
  const user = await getUser()
  if (user.role !== 'ADMIN') redirect('/dashboard')

  const params = await searchParams

  // Resolve subscription periods for the dropdown
  const periods = await getSubscriptionPeriods()
  let selectedPeriodId: string | undefined
  if (typeof params['periodId'] === 'string' && periods.some((p) => p.id === params['periodId'])) {
    selectedPeriodId = params['periodId'] as string
  } else {
    try {
      selectedPeriodId = await resolveActivePeriodId()
    } catch {
      selectedPeriodId = undefined
    }
  }

  const filters = parseReportFilters({ ...params, periodId: selectedPeriodId })
  const branches = await getActiveBranches()
  const languages = await getAvailableLanguages()

  // Fetch only the active tab's data
  let receiptSummary = null
  let overdueReport = null
  let transferReport = null
  let subscriptionOverview = null
  let receiptTimeline = null

  switch (filters.tab) {
    case 'receipts':
      receiptSummary = await getReceiptSummary(filters)
      break
    case 'overdue':
      overdueReport = await getOverdueReport(filters)
      break
    case 'transfers':
      transferReport = await getTransferReport(filters)
      break
    case 'subscriptions':
      subscriptionOverview = await getSubscriptionOverview(filters)
      break
    case 'timeline':
      receiptTimeline = await getReceiptTimeline(filters)
      break
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <ReportsClient
        filters={filters}
        branches={branches}
        languages={languages}
        periods={periods}
        receiptSummary={receiptSummary}
        overdueReport={overdueReport}
        transferReport={transferReport}
        subscriptionOverview={subscriptionOverview}
        receiptTimeline={receiptTimeline}
      />
    </div>
  )
}
