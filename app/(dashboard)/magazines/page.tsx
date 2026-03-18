import type { Metadata } from 'next'
import type { MagazineWithStatus } from '@/types'
import { verifySession } from '@/lib/dal'
import db from '@/lib/db'
import { computeNextExpectedDate, getMagazineStatus, CADENCE_LABELS } from '@/lib/cadence'
import { format } from 'date-fns'
import Link from 'next/link'
import MagazineStatusBadge from '@/components/MagazineStatusBadge'
import MagazinesClientControls from '@/components/MagazinesClientControls'
import { BookOpen } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Magazines — EPL Magazine Tracker' }

function fmt(date: Date | string | null): string {
  return date ? format(new Date(date), 'MMM d, yyyy') : '—'
}

type SearchParams = { [key: string]: string | string[] | undefined }

interface PageProps {
  searchParams: Promise<SearchParams>
}

export default async function MagazinesPage({ searchParams }: PageProps) {
  await verifySession()
  const params = await searchParams
  const filter = (typeof params?.status === 'string' ? params.status : undefined) || 'all'

  const magazines = await db.magazine.findMany({
    where: { active: true },
    include: {
      receipts: {
        orderBy: { receivedDate: 'desc' },
        take: 1,
        include: { receivedBy: { select: { name: true } } },
      },
    },
    orderBy: { name: 'asc' },
  })

  const processed: MagazineWithStatus[] = magazines.map((mag) => {
    const lastReceipt = mag.receipts[0] ?? null
    const lastReceivedDate = lastReceipt?.receivedDate ?? null
    const nextExpectedDate = computeNextExpectedDate(lastReceivedDate, mag.cadence)
    const status = getMagazineStatus(lastReceivedDate, mag.cadence)
    return { ...mag, lastReceivedDate, nextExpectedDate, status, lastReceivedBy: lastReceipt?.receivedBy?.name }
  })

  const filtered = filter === 'all' ? processed : processed.filter((m) => m.status === filter)

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-3xl font-bold mb-1"
            style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
          >
            Magazines
          </h1>
          <p style={{ color: 'oklch(0.50 0.035 72)' }}>
            {filtered.length} of {processed.length} magazine{processed.length !== 1 ? 's' : ''}
          </p>
        </div>

        <MagazinesClientControls currentFilter={filter} />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'oklch(0.60 0.025 72)' }}>
          <BookOpen size={40} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium" style={{ fontFamily: 'var(--font-playfair)' }}>
            No magazines match this filter
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
                <TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Name</TableHead>
                <TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Cadence</TableHead>
                <TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Status</TableHead>
                <TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Last Received</TableHead>
                <TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Next Expected</TableHead>
                <TableHead className="font-semibold text-right" style={{ color: 'oklch(0.30 0.028 62)' }}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((mag) => (
                <TableRow
                  key={mag.id}
                  className="hover:bg-black/[0.02] transition-colors"
                  style={{ borderColor: 'oklch(0.900 0.012 88)' }}
                >
                  <TableCell>
                    <div>
                      <p
                        className="font-medium"
                        style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
                      >
                        {mag.name}
                      </p>
                      {mag.notes && (
                        <p className="text-xs mt-0.5 truncate max-w-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
                          {mag.notes}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="text-xs"
                      style={{
                        backgroundColor: 'oklch(0.38 0.082 156 / 0.08)',
                        color: 'oklch(0.38 0.082 156)',
                        borderColor: 'oklch(0.38 0.082 156 / 0.20)',
                      }}
                    >
                      {CADENCE_LABELS[mag.cadence]}
                    </Badge>
                  </TableCell>
                  <TableCell><MagazineStatusBadge status={mag.status} /></TableCell>
                  <TableCell>
                    <div>
                      <span className="text-sm" style={{ color: 'oklch(0.25 0.028 62)' }}>
                        {fmt(mag.lastReceivedDate)}
                      </span>
                      {mag.lastReceivedBy && (
                        <p className="text-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
                          by {mag.lastReceivedBy}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm" style={{ color: 'oklch(0.25 0.028 62)' }}>
                      {fmt(mag.nextExpectedDate)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <MagazinesClientControls magazineId={mag.id} magazine={mag} mode="row-actions" />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        nativeButton={false}
                        render={<Link href={`/magazines/${mag.id}`} />}
                      >
                        History
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
