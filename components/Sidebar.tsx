'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import type { AuthUser } from '@/types'
import {
  LayoutDashboard,
  BookOpen,
  Users,
  ScrollText,
  LogOut,
  ChevronRight,
  BookMarked,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

export interface SidebarProps {
  user: AuthUser
}

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

const FOREST = 'oklch(0.215 0.058 158)'
const FOREST_HOVER = 'oklch(0.29 0.065 158)'
const GOLD = 'oklch(0.60 0.128 79)'
const CREAM = 'oklch(0.92 0.010 91)'
const CREAM_MUTED = 'oklch(0.62 0.020 155)'

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/magazines', label: 'Magazines', icon: BookOpen },
]

const adminItems: NavItem[] = [
  { href: '/admin/magazines', label: 'Manage Magazines', icon: BookMarked },
  { href: '/admin/users', label: 'Manage Users', icon: Users },
  { href: '/log', label: 'Audit Log', icon: ScrollText },
]

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <aside
      className="w-64 flex-shrink-0 flex flex-col h-full"
      style={{ backgroundColor: FOREST }}
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{ borderColor: 'oklch(0.30 0.055 158)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/epl-logo-white.png"
          alt="Edison Public Library"
          className="h-10 w-auto"
        />
      </div>

      {/* Main navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="px-2 pb-1 text-xs font-medium uppercase tracking-widest" style={{ color: CREAM_MUTED }}>
          Navigation
        </p>

        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all group"
            style={{
              backgroundColor: isActive(href) ? FOREST_HOVER : 'transparent',
              color: isActive(href) ? CREAM : CREAM_MUTED,
            }}
          >
            <Icon
              size={16}
              style={{ color: isActive(href) ? GOLD : CREAM_MUTED }}
              className="flex-shrink-0 transition-colors"
            />
            <span className="font-medium">{label}</span>
            {isActive(href) && (
              <ChevronRight size={12} className="ml-auto" style={{ color: GOLD }} />
            )}
          </Link>
        ))}

        {/* Admin section */}
        {user.role === 'ADMIN' && (
          <>
            <div className="pt-4 pb-1">
              <Separator style={{ backgroundColor: 'oklch(0.30 0.055 158)' }} />
            </div>
            <p className="px-2 pb-1 text-xs font-medium uppercase tracking-widest" style={{ color: CREAM_MUTED }}>
              Administration
            </p>

            {adminItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all"
                style={{
                  backgroundColor: isActive(href) ? FOREST_HOVER : 'transparent',
                  color: isActive(href) ? CREAM : CREAM_MUTED,
                }}
              >
                <Icon
                  size={16}
                  style={{ color: isActive(href) ? GOLD : CREAM_MUTED }}
                  className="flex-shrink-0"
                />
                <span className="font-medium">{label}</span>
                {isActive(href) && (
                  <ChevronRight size={12} className="ml-auto" style={{ color: GOLD }} />
                )}
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* User info + logout */}
      <div className="border-t p-4 space-y-3" style={{ borderColor: 'oklch(0.30 0.055 158)' }}>
        <div className="flex items-center gap-3 px-1">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: 'oklch(0.30 0.065 158)', color: CREAM }}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate" style={{ color: CREAM }}>
              {user.name}
            </p>
            <Badge
              variant="outline"
              className="text-xs px-1.5 py-0 border-0 font-medium"
              style={{
                backgroundColor: user.role === 'ADMIN'
                  ? 'oklch(0.60 0.128 79 / 0.20)'
                  : 'oklch(0.38 0.082 156 / 0.30)',
                color: user.role === 'ADMIN' ? GOLD : CREAM,
              }}
            >
              {user.role}
            </Badge>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors hover:bg-black/10 cursor-pointer"
          style={{ color: CREAM_MUTED }}
        >
          <LogOut size={15} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  )
}
