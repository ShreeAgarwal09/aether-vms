import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScreenState } from '@/components/ScreenState'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { dashboardPathForRole } from '@/lib/routes'

export function ResetPasswordPage() {
  const { configured, loading, session, profile } = useAuth()
  const [recoveryReady, setRecoveryReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    const supabase = getSupabase()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryReady(true)
      }
    })
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setRecoveryReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (!configured) {
    return (
      <ScreenState
        title="Supabase is not connected"
        body="Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to a local .env file."
      />
    )
  }

  if (loading) {
    return <ScreenState title="Preparing reset" body="Validating your secure link…" loading />
  }

  if (session && profile?.is_active && done) {
    return <Navigate to={dashboardPathForRole(profile.role)} replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match.')
      return
    }
    setFormError(null)
    setSubmitting(true)
    const { error } = await getSupabase().auth.updateUser({ password })
    setSubmitting(false)
    if (error) {
      setFormError(error.message)
      return
    }
    setDone(true)
  }

  if (!recoveryReady) {
    return (
      <div className="relative min-h-svh overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(201,162,39,0.14),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(72,110,160,0.18),transparent_40%)]" />
        <div className="relative mx-auto flex min-h-svh max-w-lg items-center px-6 py-12">
          <Card className="w-full">
            <CardHeader>
              <h2 className="font-display text-3xl text-ivory">Invalid or expired link</h2>
              <p className="text-sm leading-6 text-mist">
                This password reset link is not valid. Request a new one from the sign-in page.
              </p>
            </CardHeader>
            <CardContent>
              <Link
                to="/forgot-password"
                className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-gold px-4 text-sm font-medium text-navy-950 hover:bg-gold/90"
              >
                Request new link
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-svh overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(201,162,39,0.14),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(72,110,160,0.18),transparent_40%)]" />
      <div className="relative mx-auto flex min-h-svh max-w-lg items-center px-6 py-12">
        <Card className="w-full">
          <CardHeader>
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-gold/30 bg-gold/10 text-gold">
              <KeyRound className="h-5 w-5" />
            </div>
            <h2 className="font-display text-3xl text-ivory">{done ? 'Password updated' : 'Set a new password'}</h2>
            <p className="text-sm leading-6 text-mist">
              {done
                ? 'Your password was updated. You can continue to your dashboard.'
                : 'Choose a new password for your Admin or Company account.'}
            </p>
          </CardHeader>
          <CardContent>
            {done ? (
              session && profile?.is_active ? (
                <Link
                  to={dashboardPathForRole(profile.role)}
                  className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-gold px-4 text-sm font-medium text-navy-950 hover:bg-gold/90"
                >
                  Continue
                </Link>
              ) : (
                <Link
                  to="/login"
                  className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-gold px-4 text-sm font-medium text-navy-950 hover:bg-gold/90"
                >
                  Sign in
                </Link>
              )
            ) : (
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm_password">Confirm password</Label>
                  <Input
                    id="confirm_password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </div>
                {formError ? (
                  <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    {formError}
                  </p>
                ) : null}
                <Button className="w-full" type="submit" disabled={submitting}>
                  {submitting ? 'Saving…' : 'Update password'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
