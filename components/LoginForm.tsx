'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { Branch } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Eye, EyeOff, LogIn, Loader2, ArrowRight } from 'lucide-react'

export interface LoginFormProps {
  branches: Branch[]
}

/** Two-step login: (1) username + password, (2) branch selection */
export default function LoginForm({ branches }: LoginFormProps) {
  const router = useRouter()
  const [step, setStep] = useState<'credentials' | 'branch'>('credentials')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [branchId, setBranchId] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  /** Step 1: validate credentials */
  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })

      const data = (await res.json()) as { error?: string }

      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        return
      }

      // Credentials valid — advance to branch selection
      setStep('branch')
    } catch {
      setError('Unable to connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /** Step 2: set branch cookie and enter the app */
  function handleBranchSelect(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    if (!branchId) {
      setError('Please select a branch')
      return
    }

    document.cookie = `epl-active-branch=${branchId}; path=/; max-age=${365 * 24 * 60 * 60}`
    router.push('/dashboard')
    router.refresh()
  }

  /* ── Step 2: Branch selection ── */
  if (step === 'branch') {
    return (
      <div>
        <h2
          className="text-3xl font-bold mb-2"
          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
        >
          Choose your branch
        </h2>
        <p className="text-sm mb-8" style={{ color: 'oklch(0.50 0.035 72)' }}>
          Select the branch you&apos;re working at today
        </p>
        <form onSubmit={handleBranchSelect} className="space-y-5">
        {error && (
          <Alert variant="destructive" className="py-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="branch" style={{ color: 'oklch(0.30 0.028 62)' }}>
            Branch
          </Label>
          <Select value={branchId} onValueChange={(v) => setBranchId(v ?? '')}>
            <SelectTrigger id="branch" className="h-11">
              <SelectValue placeholder="Choose a branch…">
                {branches.find((b) => b.id === branchId)?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="submit"
          className="w-full h-11 font-medium gap-2"
          style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
        >
          <ArrowRight size={16} /> Enter
        </Button>
      </form>
      </div>
    )
  }

  /* ── Step 1: Credentials ── */
  return (
    <div>
      <h2
        className="text-3xl font-bold mb-2"
        style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
      >
        Welcome back
      </h2>
      <p className="text-sm mb-8" style={{ color: 'oklch(0.50 0.035 72)' }}>
        Sign in to manage the magazine collection
      </p>
      <form onSubmit={handleLogin} className="space-y-5">
      {error && (
        <Alert variant="destructive" className="py-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="username" style={{ color: 'oklch(0.30 0.028 62)' }}>
          Username
        </Label>
        <Input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter username"
          required
          autoComplete="username"
          className="h-11"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" style={{ color: 'oklch(0.30 0.028 62)' }}>
          Password
        </Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            className="h-11 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <Button
        type="submit"
        className="w-full h-11 font-medium gap-2"
        disabled={loading}
        style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
      >
        {loading ? (
          <><Loader2 size={16} className="animate-spin" /> Signing in…</>
        ) : (
          <><LogIn size={16} /> Sign In</>
        )}
      </Button>
    </form>
    </div>
  )
}
