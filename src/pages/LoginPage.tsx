import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScreenState } from '@/components/ScreenState'
import { useAuth } from '@/contexts/AuthContext'
import { dashboardPathForRole } from '@/lib/routes'

export function LoginPage() {
  const { configured, loading, session, profile, signIn } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  if (!configured) {
    return (
      <ScreenState
        title="Supabase is not connected"
        body="Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to a local .env file. Use the anon or publishable key only — never the service-role key."
      />
    )
  }

  if (loading) {
    return <ScreenState title="Preparing sign-in" body="Connecting to your workspace…" loading />
  }

  if (session && profile?.is_active) {
    const from = (location.state as { from?: string } | null)?.from
    const home = dashboardPathForRole(profile.role)
    const destination =
      from?.startsWith('/admin') && profile.role === 'admin'
        ? from
        : from?.startsWith('/company') && profile.role === 'company'
          ? from
          : home
    return <Navigate to={destination} replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setFormError(null)
    setSubmitting(true)
    const result = await signIn(email, password)
    setSubmitting(false)
    if (result.error) {
      setFormError(result.error)
    }
  }

  return (
    <div className="relative min-h-svh overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(201,162,39,0.14),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(72,110,160,0.18),transparent_40%)]" />
      <div className="relative mx-auto grid min-h-svh max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="hidden lg:block">
      <p className="text-xs font-medium uppercase tracking-[0.24em] text-gold">Aether VMS</p>
      <h1 className="mt-4 max-w-xl font-display text-5xl leading-[1.05] text-ivory">
            A controlled workspace for vendor onboarding.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-mist">
            Sign in to the Admin or Company portal. Access is granted from your profile role in
            PostgreSQL — not from client-side flags.
          </p>
          <div className="mt-10 grid max-w-lg grid-cols-2 gap-4 text-sm">
            <div className="rounded-xl border border-line bg-navy-900/60 p-4">
              <p className="text-gold">Admin</p>
              <p className="mt-1 text-mist">Protected operations console</p>
            </div>
            <div className="rounded-xl border border-line bg-navy-900/60 p-4">
              <p className="text-gold">Company</p>
              <p className="mt-1 text-mist">Master dashboard access</p>
            </div>
          </div>
        </div>

        <Card className="w-full max-w-md justify-self-center lg:justify-self-end">
          <CardHeader>
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-gold/30 bg-gold/10 text-gold">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">Aether VMS</p>
            <h2 className="font-display text-3xl text-ivory">Sign in</h2>
            <p className="text-sm leading-6 text-mist">
              Use the email and password for your Admin or Company account.
            </p>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              {formError ? (
                <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {formError}
                </p>
              ) : null}
              {session && profile && !profile.is_active ? (
                <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  This account is inactive. Contact an administrator.
                </p>
              ) : null}
              <Button className="w-full" type="submit" disabled={submitting}>
                {submitting ? 'Signing in…' : 'Continue'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
