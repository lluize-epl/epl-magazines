'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { AuthUser } from '@/types'
import { Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

export interface ProfileClientProps {
  user: AuthUser
}

export default function ProfileClient({ user }: ProfileClientProps) {
  const router = useRouter()

  // Name form
  const [name, setName] = useState(user.name)
  const [nameSaving, setNameSaving] = useState(false)

  // Password form
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)

  const passwordsMatch = newPassword === confirmPassword
  const passwordValid = newPassword.length >= 8

  async function handleNameSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!name.trim()) return
    setNameSaving(true)

    try {
      const res = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })

      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        toast.error(data.error || 'Failed to update name')
        return
      }

      toast.success('Name updated')
      router.refresh()
    } catch {
      toast.error('Something went wrong')
    } finally {
      setNameSaving(false)
    }
  }

  async function handlePasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!passwordsMatch || !passwordValid) return
    setPasswordSaving(true)

    try {
      const res = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })

      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        toast.error(data.error || 'Failed to update password')
        return
      }

      toast.success('Password updated')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      toast.error('Something went wrong')
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <div className="space-y-8 max-w-lg">
      {/* User info */}
      <div className="flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold"
          style={{ backgroundColor: 'oklch(0.38 0.082 156 / 0.12)', color: 'oklch(0.38 0.082 156)' }}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-lg font-medium" style={{ color: 'oklch(0.15 0.028 62)' }}>{user.name}</p>
          <p className="text-sm" style={{ color: 'oklch(0.50 0.035 72)' }}>{user.username}</p>
          <Badge
            variant="outline"
            className="text-xs mt-1 border-0"
            style={{
              backgroundColor: user.role === 'ADMIN'
                ? 'oklch(0.95 0.06 85)'
                : 'oklch(0.92 0.050 155)',
              color: user.role === 'ADMIN'
                ? 'oklch(0.45 0.15 78)'
                : 'oklch(0.38 0.082 156)',
            }}
          >
            {user.role}
          </Badge>
        </div>
      </div>

      <Separator />

      {/* Change name */}
      <form onSubmit={handleNameSubmit} className="space-y-3">
        <h2
          className="text-lg font-semibold"
          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
        >
          Change Name
        </h2>
        <div className="space-y-1.5">
          <Label htmlFor="profile-name">Name</Label>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <Button
          type="submit"
          disabled={nameSaving || name.trim() === user.name}
          className="gap-2"
          style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
        >
          {nameSaving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Save size={15} /> Save Name</>}
        </Button>
      </form>

      <Separator />

      {/* Change password */}
      <form onSubmit={handlePasswordSubmit} className="space-y-3">
        <h2
          className="text-lg font-semibold"
          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
        >
          Change Password
        </h2>
        <div className="space-y-1.5">
          <Label htmlFor="current-pw">Current Password</Label>
          <Input
            id="current-pw"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-pw">New Password</Label>
          <Input
            id="new-pw"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          {newPassword && !passwordValid && (
            <p className="text-xs text-red-500">Must be at least 8 characters</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-pw">Confirm New Password</Label>
          <Input
            id="confirm-pw"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
          {confirmPassword && !passwordsMatch && (
            <p className="text-xs text-red-500">Passwords do not match</p>
          )}
        </div>
        <Button
          type="submit"
          disabled={passwordSaving || !passwordsMatch || !passwordValid || !currentPassword}
          className="gap-2"
          style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
        >
          {passwordSaving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Save size={15} /> Update Password</>}
        </Button>
      </form>
    </div>
  )
}
