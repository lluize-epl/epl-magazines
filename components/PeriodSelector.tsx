'use client'

import { useRouter } from 'next/navigation'
import { CalendarRange } from 'lucide-react'
import type { SubscriptionPeriod } from '@/types'

export interface PeriodSelectorProps {
  periods: SubscriptionPeriod[]
  activePeriodId: string
}

/** Dropdown for selecting the active subscription period. Sets a cookie and refreshes. */
export default function PeriodSelector({ periods, activePeriodId }: PeriodSelectorProps) {
  const router = useRouter()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const periodId = e.target.value
    document.cookie = `epl-active-period=${periodId};path=/;max-age=${365 * 24 * 60 * 60};SameSite=Lax`
    router.refresh()
  }

  const activePeriod = periods.find(p => p.id === activePeriodId)

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <CalendarRange size={12} style={{ color: 'oklch(0.65 0.06 156)' }} />
        <span
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: 'oklch(0.55 0.04 158)' }}
        >
          Subscription
        </span>
      </div>
      <select
        value={activePeriodId}
        onChange={handleChange}
        className="w-full rounded-md border-0 text-sm font-medium py-1.5 px-2 cursor-pointer focus:outline-none focus:ring-2"
        style={{
          backgroundColor: 'oklch(0.28 0.05 158)',
          color: 'oklch(0.90 0.02 158)',
        }}
        title={`Current period: ${activePeriod?.name ?? 'Unknown'}`}
      >
        {periods.map(period => (
          <option key={period.id} value={period.id}>
            {period.name}
          </option>
        ))}
      </select>
    </div>
  )
}
