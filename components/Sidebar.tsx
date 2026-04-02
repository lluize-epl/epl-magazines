'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import type { AuthUser, Branch, SubscriptionPeriod } from '@/types'
import BranchSelector from './BranchSelector'
import PeriodSelector from './PeriodSelector'
import {
  LayoutDashboard,
  BookOpen,
  Users,
  ScrollText,
  LogOut,
  ChevronRight,
  ChevronLeft,
  BookMarked,
  ArrowLeftRight,
  BarChart3,
  CalendarRange,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'

export interface SidebarProps {
  user: AuthUser
  branches: Branch[]
  activeBranchId: string
  periods: SubscriptionPeriod[]
  activePeriodId: string
  defaultCollapsed?: boolean
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
  { href: '/admin/subscriptions', label: 'Subscriptions', icon: CalendarRange },
  { href: '/admin/magazines', label: 'Manage Magazines', icon: BookMarked },
  { href: '/admin/transfers', label: 'Transfers', icon: ArrowLeftRight },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { href: '/admin/users', label: 'Manage Users', icon: Users },
  { href: '/log', label: 'Audit Log', icon: ScrollText },
]

export default function Sidebar({ user, branches, activeBranchId, periods, activePeriodId, defaultCollapsed }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false)

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    document.cookie = `epl-sidebar-collapsed=${next};path=/;max-age=${60 * 60 * 24 * 365}`
  }

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
      className="flex-shrink-0 flex flex-col h-full transition-all duration-300 relative"
      style={{ backgroundColor: FOREST, width: collapsed ? '64px' : '256px' }}
    >
      {/* Collapse toggle button */}
      <button
        onClick={toggleCollapsed}
        className="absolute -right-3 top-6 z-10 w-6 h-6 rounded-full flex items-center justify-center border transition-colors cursor-pointer"
        style={{
          backgroundColor: FOREST,
          borderColor: 'oklch(0.30 0.055 158)',
          color: CREAM,
        }}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{ borderColor: 'oklch(0.30 0.055 158)' }}>
        {collapsed ? (
          <span className="text-lg font-bold block text-center" style={{ color: CREAM }}>E</span>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src="/epl-logo-white.png" alt="Edison Public Library" className="h-10 w-auto" />
        )}
      </div>

      {/* Main navigation */}
      <TooltipProvider>
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {!collapsed && (
          <p className="px-2 pb-1 text-xs font-medium uppercase tracking-widest" style={{ color: CREAM_MUTED }}>
            Navigation
          </p>
        )}

        {navItems.map(({ href, label, icon: Icon }) => {
          const active = isActive(href)
          const link = (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all group ${
                active ? '' : 'hover:bg-white/10 hover:scale-[1.02]'
              }`}
              style={{
                backgroundColor: active ? FOREST_HOVER : undefined,
                color: active ? CREAM : CREAM_MUTED,
                justifyContent: collapsed ? 'center' : 'flex-start',
              }}
            >
              <Icon
                size={16}
                style={{ color: active ? GOLD : CREAM_MUTED }}
                className="flex-shrink-0 transition-all group-hover:text-white"
              />
              {!collapsed && (
                <span className={`font-medium transition-colors ${active ? '' : 'group-hover:text-white'}`}>
                  {label}
                </span>
              )}
              {!collapsed && active && (
                <ChevronRight size={12} className="ml-auto" style={{ color: GOLD }} />
              )}
            </Link>
          )
          return collapsed ? (
            <Tooltip key={href}>
              <TooltipTrigger render={<div />}>{link}</TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          ) : link
        })}

        {/* Admin section */}
        {user.role === 'ADMIN' && (
          <>
            <div className="pt-4 pb-1">
              <Separator style={{ backgroundColor: 'oklch(0.30 0.055 158)' }} />
            </div>
            {!collapsed && (
              <p className="px-2 pb-1 text-xs font-medium uppercase tracking-widest" style={{ color: CREAM_MUTED }}>
                Administration
              </p>
            )}

            {adminItems.map(({ href, label, icon: Icon }) => {
              const active = isActive(href)
              const link = (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all group ${
                    active ? '' : 'hover:bg-white/10 hover:scale-[1.02]'
                  }`}
                  style={{
                    backgroundColor: active ? FOREST_HOVER : undefined,
                    color: active ? CREAM : CREAM_MUTED,
                    justifyContent: collapsed ? 'center' : 'flex-start',
                  }}
                >
                  <Icon
                    size={16}
                    style={{ color: active ? GOLD : CREAM_MUTED }}
                    className="flex-shrink-0 transition-all group-hover:text-white"
                  />
                  {!collapsed && (
                    <span className={`font-medium transition-colors ${active ? '' : 'group-hover:text-white'}`}>
                      {label}
                    </span>
                  )}
                  {!collapsed && active && (
                    <ChevronRight size={12} className="ml-auto" style={{ color: GOLD }} />
                  )}
                </Link>
              )
              return collapsed ? (
                <Tooltip key={href}>
                  <TooltipTrigger render={<div />}>{link}</TooltipTrigger>
                  <TooltipContent side="right">{label}</TooltipContent>
                </Tooltip>
              ) : link
            })}
          </>
        )}
      </nav>
      </TooltipProvider>

      {/* Period selector + Branch selector */}
      {!collapsed && (
        <div className="border-t mt-auto" style={{ borderColor: 'oklch(0.30 0.04 158)' }}>
          <PeriodSelector periods={periods} activePeriodId={activePeriodId} />
          <BranchSelector branches={branches} activeBranchId={activeBranchId} />
        </div>
      )}
      <TooltipProvider>
        <div className="border-t p-4 space-y-3" style={{ borderColor: 'oklch(0.30 0.055 158)' }}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger render={<div />}>
                <Link
                  href="/profile"
                  className="flex items-center justify-center rounded-md transition-colors hover:bg-white/5"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: 'oklch(0.30 0.065 158)', color: CREAM }}
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{user.name}</TooltipContent>
            </Tooltip>
          ) : (
            <Link
              href="/profile"
              className="flex items-center gap-3 px-1 rounded-md transition-colors hover:bg-white/5"
            >
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
            </Link>
          )}

          {collapsed ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm transition-colors hover:bg-black/10 cursor-pointer"
                    style={{ color: CREAM_MUTED }}
                  />
                }
              >
                <LogOut size={15} />
              </TooltipTrigger>
              <TooltipContent side="right">Sign out</TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors hover:bg-black/10 cursor-pointer"
              style={{ color: CREAM_MUTED }}
            >
              <LogOut size={15} />
              <span>Sign out</span>
            </button>
          )}
        </div>
      </TooltipProvider>
    </aside>
  )
}
