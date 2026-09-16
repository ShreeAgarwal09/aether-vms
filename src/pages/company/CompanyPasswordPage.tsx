import { useState, type FormEvent } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { userFacingError, MESSAGES } from '@/lib/errors'
import { getSupabase } from '@/lib/supabase'

export function CompanyPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setError(null)
    setSuccess(null)
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setPending(true)
    const { error: updateError } = await getSupabase().auth.updateUser({ password })
    setPending(false)
    if (updateError) {
      setError(userFacingError(updateError.message, MESSAGES.generic))
      return
    }
    setPassword('')
    setConfirm('')
    setSuccess('Password updated.')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Password"
        description="Change the password for this company login. The session JWT is used — no service-role key is involved."
      />
      <Card className="max-w-xl">
        <CardContent className="p-6">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </div>
            {error ? <p className="text-sm text-red-200">{error}</p> : null}
            {success ? <p className="text-sm text-emerald-200">{success}</p> : null}
            <Button type="submit" disabled={pending}>
              {pending ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
