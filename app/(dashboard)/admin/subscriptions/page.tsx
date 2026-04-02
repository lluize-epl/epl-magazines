import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { getUser } from '@/lib/dal'
import db from '@/lib/db'
import { CalendarRange } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import CreatePeriodDialog from '@/components/CreatePeriodDialog'

export const metadata: Metadata = { title: 'Subscription Periods — EPL Magazine Tracker' }

export default async function AdminSubscriptionsPage() {
  const user = await getUser()
  if (user.role !== 'ADMIN') redirect('/dashboard')

  const periods = await db.subscriptionPeriod.findMany({
    orderBy: { startDate: 'desc' },
    include: {
      _count: { select: { subscriptions: { where: { active: true } } } },
    },
  })

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1
          className="text-3xl font-bold mb-1"
          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
        >
          Subscription Periods
        </h1>
        <p style={{ color: 'oklch(0.50 0.035 72)' }}>
          {periods.length} period{periods.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex justify-end mb-4">
        <CreatePeriodDialog />
      </div>

      {periods.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'oklch(0.60 0.025 72)' }}>
          <CalendarRange size={40} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium" style={{ fontFamily: 'var(--font-playfair)' }}>
            No subscription periods yet
          </p>
          <p className="text-sm mt-1">Create a period to start managing subscriptions.</p>
        </div>
      ) : (
        <div
          className="rounded-lg border overflow-hidden"
          style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.978 0.009 88)' }}
        >
          <Table>
            <TableHeader>
              <TableRow style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.963 0.012 91)' }}>
                {['Name', 'Start Date', 'End Date', 'Status', 'Active Subscriptions'].map((h) => (
                  <TableHead
                    key={h}
                    className="font-semibold"
                    style={{ color: 'oklch(0.30 0.028 62)' }}
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map((period) => (
                <TableRow
                  key={period.id}
                  className="hover:bg-black/[0.02] transition-colors"
                  style={{ borderColor: 'oklch(0.900 0.012 88)' }}
                >
                  <TableCell>
                    <Link
                      href={`/admin/subscriptions/${period.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                      style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
                    >
                      {period.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm" style={{ color: 'oklch(0.40 0.028 62)' }}>
                      {format(typeof period.startDate === 'string' ? parseISO(period.startDate) : period.startDate, 'MMM d, yyyy')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm" style={{ color: 'oklch(0.40 0.028 62)' }}>
                      {format(typeof period.endDate === 'string' ? parseISO(period.endDate) : period.endDate, 'MMM d, yyyy')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="text-xs font-medium"
                      style={
                        period.active
                          ? { backgroundColor: 'oklch(0.92 0.050 155)', color: 'oklch(0.38 0.082 156)', border: 'none' }
                          : { backgroundColor: 'oklch(0.93 0.010 88)', color: 'oklch(0.50 0.020 62)', border: 'none' }
                      }
                    >
                      {period.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm" style={{ color: 'oklch(0.40 0.028 62)' }}>
                      {period._count.subscriptions}
                    </span>
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
