import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScreenState } from '@/components/ScreenState'
import { useAuth } from '@/contexts/AuthContext'
import { EMAIL_PATTERN } from '@/lib/validation'

export function ForgotPasswordPage() {
  const { configured, loading, requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  if (!configured) {
    return (
      <ScreenState
        title="Supabase is not connected"
        body="Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to a local .env file."
      />
    )
  }

  if (loading) {
    return <ScreenState title="Preparing reset" body="Connecting to your workspace…" loading />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    const trimmed = email.trim()
    if (!trimmed || !EMAIL_PATTERN.test(trimmed)) {
      setFormError('Enter a valid email address.')
      return
    }
    setFormError(null)
    setSubmitting(true)
    const result = await requestPasswordReset(trimmed)
    setSubmitting(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    setSent(true)
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
            <h2 className="font-display text-3xl text-ivory">Forgot password</h2>
            <p className="text-sm leading-6 text-mist">
              {sent
                ? `If an account exists for ${email.trim()}, a reset link has been sent. Check your inbox and spam folder.`
                : 'Enter your email and we will send a password reset link.'}
            </p>
          </CardHeader>
          <CardContent>
            {sent ? (
              <Link
                to="/login"
                className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-gold px-4 text-sm font-medium text-navy-950 hover:bg-gold/90"
              >
                Back to sign in
              </Link>
            ) : (
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                {formError ? (
                  <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    {formError}
                  </p>
                ) : null}
                <Button className="w-full" type="submit" disabled={submitting}>
                  {submitting ? 'Sending…' : 'Send reset link'}
                </Button>
                <p className="text-center text-sm text-mist">
                  <Link to="/login" className="text-gold underline-offset-4 hover:underline">
                    Back to sign in
                  </Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
