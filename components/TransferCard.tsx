'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { TransferWithDetails } from '@/types'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SendHorizontal, CalendarCheck } from 'lucide-react'

export interface TransferCardProps {
  transfer: TransferWithDetails
}

export default function TransferCard({ transfer }: TransferCardProps) {
  const router = useRouter()
  const [completing, setCompleting] = useState(false)

  async function handleComplete() {
    setCompleting(true)
    try {
      const res = await fetch(`/api/transfers/${transfer.id}/complete`, { method: 'PUT' })
      if (res.ok) {
        toast.success(`Transfer of ${transfer.magazine.name} received`)
        router.refresh()
      } else {
        const data = (await res.json()) as { error?: string }
        toast.error(data.error || 'Failed to complete transfer')
      }
    } finally {
      setCompleting(false)
    }
  }

  return (
    <Card
      className="relative overflow-hidden transition-shadow hover:shadow-md"
      style={{
        borderColor: 'oklch(0.78 0.12 250)',
        backgroundColor: 'white',
      }}
    >
      {/* Transfer indicator dot */}
      <div
        className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: 'oklch(0.55 0.18 250)' }}
      />

      <CardHeader className="pb-2 pr-8">
        <div className="flex items-start gap-2 flex-wrap">
          <Link
            href={`/magazines/${transfer.magazineId}`}
            className="font-semibold text-base leading-snug flex-1 min-w-0 hover:underline cursor-pointer"
            style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
          >
            {transfer.magazine.name}
          </Link>
        </div>
        <Badge
          variant="outline"
          className="w-fit text-xs font-medium mt-1"
          style={{
            backgroundColor: 'oklch(0.55 0.18 250 / 0.10)',
            color: 'oklch(0.45 0.15 250)',
            borderColor: 'oklch(0.55 0.18 250 / 0.25)',
          }}
        >
          Transfer · {transfer.quantity} {transfer.quantity === 1 ? 'copy' : 'copies'}
        </Badge>
      </CardHeader>

      <CardContent className="pb-3 space-y-1.5 text-sm">
        <div className="flex items-center gap-2" style={{ color: 'oklch(0.50 0.035 72)' }}>
          <SendHorizontal size={13} className="flex-shrink-0" style={{ color: 'oklch(0.55 0.18 250)' }} />
          <span>
            Will be delivered from{' '}
            <span style={{ color: 'oklch(0.25 0.028 62)', fontWeight: 500 }}>
              {transfer.fromBranch.name}
            </span>{' '}
            soon
          </span>
        </div>
      </CardContent>

      <CardFooter className="gap-2 items-center justify-center">
        <Button
          size="sm"
          className="flex-1 gap-1.5 text-xs h-8 cursor-pointer"
          onClick={handleComplete}
          disabled={completing}
          style={{ backgroundColor: 'oklch(0.45 0.15 250)' }}
        >
          <CalendarCheck size={13} /> {completing ? 'Receiving...' : 'Received'}
        </Button>
      </CardFooter>
    </Card>
  )
}
