'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, AlertTriangle, Clock } from 'lucide-react'

const ICONS = {
  clock: Clock,
  'alert-triangle': AlertTriangle,
} as const

type IconName = keyof typeof ICONS

interface CollapsibleSectionProps {
  label: string
  count: number
  iconName: IconName
  color: string
  bg: string
  border: string
  children: ReactNode
  defaultOpen?: boolean
}

export default function CollapsibleSection({
  label,
  count,
  iconName,
  color,
  bg,
  border,
  children,
  defaultOpen = true,
}: CollapsibleSectionProps) {
  const Icon = ICONS[iconName]
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 cursor-pointer group"
      >
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: bg, border: `1px solid ${border}` }}
        >
          <Icon size={15} style={{ color }} />
        </div>
        <h2
          className="text-base font-semibold leading-tight whitespace-nowrap"
          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
        >
          {label}
          <span className="ml-2 text-sm font-normal" style={{ color }}>
            ({count})
          </span>
        </h2>
        <div
          className="flex-1 mx-3 border-b"
          style={{ borderColor: 'oklch(0.85 0.012 88)' }}
        />
        <div
          className="shrink-0 transition-colors"
          style={{ color: 'oklch(0.55 0.030 72)' }}
        >
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {open && (
        <div className="mt-4">
          {children}
        </div>
      )}
    </section>
  )
}
