'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import type { LucideIcon } from 'lucide-react'
import type { MagazineStatus, MagazineWithStatus } from '@/types'
import { CalendarCheck, CalendarX, Clock, ExternalLink } from 'lucide-react'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CADENCE_LABELS } from '@/lib/cadence'
import MarkReceivedDialog from './MarkReceivedDialog'

export interface MagazineCardProps {
  magazine: MagazineWithStatus
}

interface StatusStyle {
  border: string
  bg: string
  dot: string
  icon: LucideIcon
  iconColor: string
}

const STATUS_STYLES: Record<MagazineStatus, StatusStyle> = {
  overdue: {
    border: 'oklch(0.80 0.12 27)',
    bg: 'oklch(0.99 0.006 27)',
    dot: 'oklch(0.56 0.225 27)',
    icon: CalendarX,
    iconColor: 'oklch(0.56 0.225 27)',
  },
  this_week: {
    border: 'oklch(0.82 0.12 78)',
    bg: 'oklch(0.99 0.008 85)',
    dot: 'oklch(0.60 0.128 79)',
    icon: Clock,
    iconColor: 'oklch(0.55 0.15 78)',
  },
  upcoming: {
    border: 'oklch(0.85 0.06 155)',
    bg: 'oklch(0.99 0.004 88)',
    dot: 'oklch(0.55 0.10 155)',
    icon: CalendarCheck,
    iconColor: 'oklch(0.45 0.10 155)',
  },
  never_received: {
    border: 'oklch(0.876 0.016 88)',
    bg: 'oklch(0.978 0.009 88)',
    dot: 'oklch(0.70 0.020 88)',
    icon: CalendarX,
    iconColor: 'oklch(0.65 0.020 72)',
  },
}

function fmt(date: Date | string | null): string {
  return date ? format(new Date(date), 'MMM d, yyyy') : '—'
}

export default function MagazineCard({ magazine }: MagazineCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const style = STATUS_STYLES[magazine.status] ?? STATUS_STYLES.never_received
  const StatusIcon = style.icon

  return (
    <>
      <Card
        className="relative overflow-hidden transition-shadow hover:shadow-md"
        style={{
          borderColor: style.border,
          backgroundColor: style.bg,
        }}
      >
        {/* Status dot */}
        <div
          className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: style.dot }}
        />

        <CardHeader className="pb-2 pr-8">
          <div className="flex items-start gap-2 flex-wrap">
            <h3
              className="font-semibold text-base leading-snug flex-1 min-w-0"
              style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
            >
              {magazine.name}
            </h3>
          </div>
          <Badge
            variant="outline"
            className="w-fit text-xs font-medium mt-1"
            style={{
              backgroundColor: 'oklch(0.38 0.082 156 / 0.10)',
              color: 'oklch(0.38 0.082 156)',
              borderColor: 'oklch(0.38 0.082 156 / 0.25)',
            }}
          >
            {CADENCE_LABELS[magazine.cadence]}
          </Badge>
        </CardHeader>

        <CardContent className="pb-3 space-y-1.5 text-sm">
          <div className="flex items-center gap-2" style={{ color: 'oklch(0.50 0.035 72)' }}>
            <CalendarCheck size={13} className="flex-shrink-0" />
            <span>
              Last received:{' '}
              <span style={{ color: 'oklch(0.25 0.028 62)', fontWeight: 500 }}>
                {magazine.lastReceivedDate ? fmt(magazine.lastReceivedDate) : 'Never'}
              </span>
            </span>
          </div>

          {magazine.nextExpectedDate && (
            <div className="flex items-center gap-2" style={{ color: 'oklch(0.50 0.035 72)' }}>
              <StatusIcon size={13} className="flex-shrink-0" style={{ color: style.iconColor }} />
              <span>
                Next expected:{' '}
                <span style={{ color: style.iconColor, fontWeight: 500 }}>
                  {fmt(magazine.nextExpectedDate)}
                </span>
              </span>
            </div>
          )}

          {!magazine.nextExpectedDate && (
            <p className="text-xs italic" style={{ color: 'oklch(0.60 0.020 72)' }}>
              Never received — status unknown
            </p>
          )}
        </CardContent>

        <CardFooter className="gap-2 items-center justify-center">
          <Button
            size="sm"
            className="flex-1 gap-1.5 text-xs h-8 cursor-pointer"
            onClick={() => setDialogOpen(true)}
            style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
          >
            <CalendarCheck size={13} /> Mark Received
          </Button>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2"
                  nativeButton={false}
                  render={<Link href={`/magazines/${magazine.id}`} />}
                />
              }
            >
              <ExternalLink size={13} />
            </TooltipTrigger>
            <TooltipContent>Details</TooltipContent>
          </Tooltip>
        </CardFooter>
      </Card>

      <MarkReceivedDialog
        magazine={magazine}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  )
}
