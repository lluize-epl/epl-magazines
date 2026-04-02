import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getUser } from '@/lib/dal'
import db from '@/lib/db'
import AdminUsersClient from '@/components/AdminUsersClient'
import MagazineSearch from '@/components/MagazineSearch'

export const metadata: Metadata = { title: 'Manage Users — EPL Magazine Tracker' }

const PAGE_SIZE = 10

type SearchParams = { [key: string]: string | string[] | undefined }

interface PageProps {
  searchParams: Promise<SearchParams>
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const currentUser = await getUser()
  if (currentUser.role !== 'ADMIN') redirect('/dashboard')

  const params = await searchParams
  const search = typeof params?.search === 'string' ? params.search.trim() : ''
  const page = Math.max(1, parseInt((typeof params?.page === 'string' ? params.page : undefined) || '1', 10))

  const where = search
    ? {
        OR: [
          { name: { contains: search } },
          { username: { contains: search } },
        ],
      }
    : {}

  const totalCount = await db.user.count({ where })
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const startIdx = (currentPage - 1) * PAGE_SIZE

  const users = await db.user.findMany({
    where,
    orderBy: { name: 'asc' },
    skip: startIdx,
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      active: true,
      createdAt: true,
      _count: { select: { receipts: true } },
    },
  })

  const unfilteredCount = search ? await db.user.count() : totalCount

  // All user names for search dropdown
  const allUsers = await db.user.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  function pageUrl(p: number): string {
    const u = new URLSearchParams()
    if (search) u.set('search', search)
    if (p > 1) u.set('page', String(p))
    const qs = u.toString()
    return `/admin/users${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1
          className="text-3xl font-bold mb-1"
          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
        >
          Manage Users
        </h1>
        <p style={{ color: 'oklch(0.50 0.035 72)' }}>
          {totalCount} of {unfilteredCount} account{unfilteredCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Search bar */}
      <div className="mb-6">
        <MagazineSearch
          magazines={allUsers}
          currentSearch={search}
          placeholder="Search users…"
        />
      </div>

      <AdminUsersClient users={users} currentUserId={currentUser.id} search={search} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm" style={{ color: 'oklch(0.50 0.035 72)' }}>
            Showing {startIdx + 1}–{Math.min(startIdx + PAGE_SIZE, totalCount)} of {totalCount}
          </p>
          <div className="flex items-center gap-1">
            {currentPage > 1 && (
              <Link
                href={pageUrl(currentPage - 1)}
                className="inline-flex items-center justify-center h-8 px-3 rounded-md border text-sm font-medium transition-colors hover:bg-black/[0.04]"
                style={{ borderColor: 'oklch(0.876 0.016 88)', color: 'oklch(0.30 0.028 62)' }}
              >
                Previous
              </Link>
            )}
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              p === currentPage ? (
                <span
                  key={p}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-md text-sm font-medium text-white"
                  style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
                >
                  {p}
                </span>
              ) : (
                <Link
                  key={p}
                  href={pageUrl(p)}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-md border text-sm font-medium transition-colors hover:bg-black/[0.04]"
                  style={{ borderColor: 'oklch(0.876 0.016 88)', color: 'oklch(0.30 0.028 62)' }}
                >
                  {p}
                </Link>
              )
            ))}
            {currentPage < totalPages && (
              <Link
                href={pageUrl(currentPage + 1)}
                className="inline-flex items-center justify-center h-8 px-3 rounded-md border text-sm font-medium transition-colors hover:bg-black/[0.04]"
                style={{ borderColor: 'oklch(0.876 0.016 88)', color: 'oklch(0.30 0.028 62)' }}
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
