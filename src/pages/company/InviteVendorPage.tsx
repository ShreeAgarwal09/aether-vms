import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { inviteVendor } from '@/lib/vendor-api'
import { validateVendorInvite } from '@/lib/validation'

export function InviteVendorPage() {
  const [vendorName, setVendorName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const nextErrors = validateVendorInvite({
      vendor_name: vendorName,
      email,
      vendor_phone: phone,
    })
    setFieldErrors(nextErrors)
    setError(null)
    if (Object.keys(nextErrors).length) return
    setPending(true)
    const result = await inviteVendor({
      vendor_name: vendorName.trim(),
      email: email.trim(),
      vendor_phone: phone.trim(),
    })
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setSuccess(result.message ?? 'Vendor invited.')
    setInviteLink(result.inviteLink ?? null)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Invitations"
        title="Invite vendor"
        description="Creates a company-owned vendor record with status invited. The unique invitation token is hashed in the database. The raw link is emailed when mail is configured and shown once here so you can copy it."
      />
      <Card className="max-w-xl">
        <CardContent className="p-6">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="vendor_name">Vendor name</Label>
              <Input id="vendor_name" value={vendorName} onChange={(event) => setVendorName(event.target.value)} />
              {fieldErrors.vendor_name ? <p className="text-xs text-red-300">{fieldErrors.vendor_name}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Vendor email</Label>
              <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              {fieldErrors.email ? <p className="text-xs text-red-300">{fieldErrors.email}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Vendor phone</Label>
              <Input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="10-digit Indian mobile" />
              {fieldErrors.vendor_phone ? <p className="text-xs text-red-300">{fieldErrors.vendor_phone}</p> : null}
            </div>
            {error ? (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>
            ) : null}
            {success ? (
              <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                {success}
              </p>
            ) : null}
            {inviteLink ? (
              <p className="break-all rounded-lg border border-line px-3 py-2 text-sm text-mist">
                Secure onboarding link (shown once; hashed in the database): {inviteLink}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? 'Inviting…' : 'Create invitation'}
              </Button>
              {inviteLink ? (
                <Link to="/company/vendors" className="inline-flex h-11 items-center text-sm text-gold">
                  View vendors
                </Link>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
