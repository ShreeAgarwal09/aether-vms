import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScreenState } from '@/components/ScreenState'
import { useAuth } from '@/contexts/AuthContext'
import { dashboardPathForRole } from '@/lib/routes'
import { validateCompanyForm } from '@/lib/validation'

export function SignupPage() {
  const { configured, loading, session, profile, signUp } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [mobile, setMobile] = useState('')
  const [address, setAddress] = useState('')
  const [gst, setGst] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [confirmationSent, setConfirmationSent] = useState(false)

  if (!configured) {
    return (
      <ScreenState
        title="Supabase is not connected"
        body="Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to a local .env file. Use the anon or publishable key only — never the service-role key."
      />
    )
  }

  if (loading) {
    return <ScreenState title="Preparing sign-up" body="Connecting to your workspace…" loading />
  }

  if (session && profile?.is_active) {
    return <Navigate to={dashboardPathForRole(profile.role)} replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const nextErrors = validateCompanyForm({
      full_name: fullName,
      email,
      company_name: companyName,
      company_mobile_number: mobile,
      gst_number: gst,
    })
    if (password.length < 8) {
      nextErrors.password = 'Password must be at least 8 characters.'
    }
    if (password !== confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match.'
    }
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    setFormError(null)
    setSubmitting(true)
    const result = await signUp({
      email,
      password,
      full_name: fullName,
      company_name: companyName,
      company_mobile_number: mobile,
      company_address: address,
      gst_number: gst,
    })
    setSubmitting(false)

    if (result.error) {
      setFormError(result.error)
      return
    }

    if (result.needsEmailConfirmation) {
      setConfirmationSent(true)
      return
    }
  }

  if (confirmationSent) {
    return (
      <div className="relative min-h-svh overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(201,162,39,0.14),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(72,110,160,0.18),transparent_40%)]" />
        <div className="relative mx-auto flex min-h-svh max-w-lg items-center px-6 py-12">
          <Card className="w-full">
            <CardHeader>
              <h2 className="font-display text-3xl text-ivory">Check your email</h2>
              <p className="text-sm leading-6 text-mist">
                We sent a confirmation link to <span className="text-ivory">{email}</span>. Confirm your
                email, then sign in to open the company portal.
              </p>
            </CardHeader>
            <CardContent>
              <Link
                to="/login"
                className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-gold px-4 text-sm font-medium text-navy-950 hover:bg-gold/90"
              >
                Back to sign in
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
      <div className="relative mx-auto grid min-h-svh max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-[1fr_1.1fr]">
        <div className="hidden lg:block">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-gold">Aether VMS</p>
          <h1 className="mt-4 max-w-xl font-display text-5xl leading-[1.05] text-ivory">
            Register your organization.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-mist">
            Self-registration creates a company account. You can invite vendors and manage onboarding
            after sign-in. Admin accounts are still created by a platform administrator.
          </p>
        </div>

        <Card className="w-full max-w-xl justify-self-center lg:justify-self-end">
          <CardHeader>
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-gold/30 bg-gold/10 text-gold">
              <UserPlus className="h-5 w-5" />
            </div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">Company sign up</p>
            <h2 className="font-display text-3xl text-ivory">Create account</h2>
            <p className="text-sm leading-6 text-mist">
              Already registered?{' '}
              <Link to="/login" className="text-gold underline-offset-4 hover:underline">
                Sign in
              </Link>
            </p>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" htmlFor="full_name" error={fieldErrors.full_name}>
                  <Input
                    id="full_name"
                    autoComplete="name"
                    required
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                  />
                </Field>
                <Field label="Company name" htmlFor="company_name" error={fieldErrors.company_name}>
                  <Input
                    id="company_name"
                    autoComplete="organization"
                    required
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                  />
                </Field>
              </div>
              <Field label="Work email" htmlFor="email" error={fieldErrors.email}>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Password" htmlFor="password" error={fieldErrors.password}>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </Field>
                <Field label="Confirm password" htmlFor="confirm_password" error={fieldErrors.confirmPassword}>
                  <Input
                    id="confirm_password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </Field>
              </div>
              <Field label="Mobile number" htmlFor="mobile" error={fieldErrors.company_mobile_number}>
                <Input
                  id="mobile"
                  autoComplete="tel"
                  value={mobile}
                  onChange={(event) => setMobile(event.target.value)}
                />
              </Field>
              <Field label="Company address" htmlFor="address">
                <Textarea
                  id="address"
                  autoComplete="street-address"
                  rows={2}
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                />
              </Field>
              <Field label="GST number (optional)" htmlFor="gst" error={fieldErrors.gst_number}>
                <Input
                  id="gst"
                  value={gst}
                  onChange={(event) => setGst(event.target.value.toUpperCase())}
                />
              </Field>
              {formError ? (
                <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {formError}
                </p>
              ) : null}
              <Button className="w-full" type="submit" disabled={submitting}>
                {submitting ? 'Creating account…' : 'Create company account'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  )
}
