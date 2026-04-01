import type { Metadata } from 'next'
import db from '@/lib/db'
import LoginForm from '@/components/LoginForm'
import type { Branch } from '@/types'

export const metadata: Metadata = { title: 'Sign In — EPL Magazine Tracker' }
export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const branches = await db.branch.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true, active: true, createdAt: true },
  }) as Branch[]

  return (
    <div className="min-h-screen flex">
      {/* Left panel — library identity */}
      <div
        className="hidden lg:flex lg:w-5/12 flex-col justify-between p-12"
        style={{ backgroundColor: 'oklch(0.215 0.058 158)' }}
      >
        <div>
          <div className="mb-16">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/epl-logo-white.png"
              alt="Edison Public Library"
              className="h-14 w-auto"
            />
          </div>

          <h1
            className="text-4xl font-bold leading-tight mb-6"
            style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.978 0.009 88)' }}
          >
            Keeping the collection current
          </h1>
          <p className="text-base leading-relaxed" style={{ color: 'oklch(0.72 0.025 155)' }}>
            Track magazine arrivals, flag overdue issues, and know exactly what to expect each week — all in one place.
          </p>
        </div>

        <div className="border-t pt-8" style={{ borderColor: 'oklch(0.30 0.055 158)' }}>
          <p className="text-sm italic" style={{ color: 'oklch(0.62 0.025 155)' }}>
            &quot;A library is not a luxury but one of the necessities of life.&quot;
          </p>
          <p className="text-xs mt-2" style={{ color: 'oklch(0.50 0.025 155)' }}>
            — Henry Ward Beecher
          </p>
        </div>
      </div>

      {/* Right panel — login form */}
      <div
        className="flex-1 flex items-center justify-center p-8"
        style={{ backgroundColor: 'oklch(0.963 0.012 91)' }}
      >
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="mb-10 lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/epl-logo-white.png"
              alt="Edison Public Library"
              className="h-10 w-auto brightness-0"
            />
          </div>

          <LoginForm branches={branches} />
        </div>
      </div>
    </div>
  )
}
