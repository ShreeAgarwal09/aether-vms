import { useState, type FormEvent } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { saveCompanyProfile } from '@/lib/vendor-api'
import { validateCompanyForm } from '@/lib/validation'

export function CompanyProfilePage() {
  const { profile, refreshProfile } = useAuth()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [companyName, setCompanyName] = useState(profile?.company_name ?? '')
  const [mobile, setMobile] = useState(profile?.company_mobile_number ?? '')
  const [address, setAddress] = useState(profile?.company_address ?? '')
  const [gst, setGst] = useState(profile?.gst_number ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) return
    const nextErrors = validateCompanyForm(
      {
        full_name: fullName,
        email: profile.email,
        company_name: companyName,
        company_mobile_number: mobile,
        gst_number: gst,
      },
      { requireEmail: false },
    )
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    setPending(true)
    setError(null)
    const { error: saveError } = await saveCompanyProfile(profile.id, {
      full_name: fullName.trim(),
      company_name: companyName.trim(),
      company_mobile_number: mobile.trim() || null,
      company_address: address.trim() || null,
      gst_number: gst.trim().toUpperCase() || null,
    })
    setPending(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    await refreshProfile()
    setSuccess('Profile saved.')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Company profile"
        description="Update the details shown across the company portal. Email and role cannot be changed here."
      />
      <Card className="max-w-xl">
        <CardContent className="p-6">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={profile?.email ?? ''} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
              {fieldErrors.full_name ? <p className="text-xs text-red-300">{fieldErrors.full_name}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_name">Company name</Label>
              <Input id="company_name" value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
              {fieldErrors.company_name ? <p className="text-xs text-red-300">{fieldErrors.company_name}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="mobile">Mobile</Label>
              <Input id="mobile" value={mobile} onChange={(event) => setMobile(event.target.value)} />
              {fieldErrors.company_mobile_number ? (
                <p className="text-xs text-red-300">{fieldErrors.company_mobile_number}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="gst">GST number</Label>
              <Input id="gst" value={gst} onChange={(event) => setGst(event.target.value.toUpperCase())} />
              {fieldErrors.gst_number ? <p className="text-xs text-red-300">{fieldErrors.gst_number}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea id="address" value={address} onChange={(event) => setAddress(event.target.value)} />
            </div>
            {error ? <p className="text-sm text-red-200">{error}</p> : null}
            {success ? <p className="text-sm text-emerald-200">{success}</p> : null}
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save profile'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
