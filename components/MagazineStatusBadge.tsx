import type { MagazineStatus } from '@/types'
import { Badge } from '@/components/ui/badge'

export interface MagazineStatusBadgeProps {
  status: MagazineStatus
}

interface StatusConfig {
  label: string
  style: React.CSSProperties
}

const STATUS_CONFIG: Record<MagazineStatus, StatusConfig> = {
  overdue: {
    label: 'Overdue',
    style: { backgroundColor: 'oklch(0.93 0.04 27)', color: 'oklch(0.40 0.18 27)', border: 'none' },
  },
  this_week: {
    label: 'Expected This Week',
    style: { backgroundColor: 'oklch(0.95 0.06 85)', color: 'oklch(0.45 0.15 78)', border: 'none' },
  },
  upcoming: {
    label: 'Upcoming',
    style: { backgroundColor: 'oklch(0.92 0.05 155)', color: 'oklch(0.38 0.082 156)', border: 'none' },
  },
  never_received: {
    label: 'Never Received',
    style: { backgroundColor: 'oklch(0.93 0.010 88)', color: 'oklch(0.50 0.035 72)', border: 'none' },
  },
  completed: {
    label: 'Completed',
    style: { backgroundColor: 'oklch(0.92 0.05 155)', color: 'oklch(0.30 0.08 155)', border: 'none' },
  },
  not_subscribed: {
    label: 'Not Subscribed',
    style: { backgroundColor: 'oklch(0.93 0.005 88)', color: 'oklch(0.50 0.015 88)', border: 'none' },
  },
}

export default function MagazineStatusBadge({ status }: MagazineStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.never_received
  return (
    <Badge variant="outline" className="text-xs font-medium" style={config.style}>
      {config.label}
    </Badge>
  )
}
