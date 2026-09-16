import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { formatDateTime, VendorStatusBadge } from '@/components/company/VendorStatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { fetchVendor, resendVendorInvite } from '@/lib/vendor-api'
import type { Vendor } from '@/lib/types'

export function VendorDetailPage() {
  const { vendorId } = useParams()
  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!vendorId) return
    setLoading(true)
    fetchVendor(vendorId).then(({ data, error: loadError }) => {
      if (loadError) {
        setError(loadError.message)
        setVendor(null)
      } else if (!data) {
        setError('This vendor was not found in your company directory.')
        setVendor(null)
      } else {
        setVendor(data as Vendor)
        setError(null)
      }
      setLoading(false)
    })
  }, [vendorId])

  async function resend() {
    if (!vendor) return
    const result = await resendVendorInvite(vendor.id)
    setFeedback(result.error ?? result.message ?? 'Invitation processed.')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Vendor details"
        title={vendor?.vendor_name || 'Vendor'}
        description="Stored invitation information only. The 5-step vendor onboarding form is not part of this phase."
        action={
          <Link to="/company/vendors" className="text-sm text-gold hover:text-gold-bright">
            Back to vendors
          </Link>
        }
      />
      {loading ? <div className="h-48 animate-pulse rounded-2xl bg-navy-800/80" /> : null}
      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-8 text-sm text-red-200">{error}</div>
      ) : null}
      {feedback ? (
        <div className="rounded-xl border border-line bg-navy-900/80 px-4 py-3 text-sm text-mist">{feedback}</div>
      ) : null}
      {vendor ? (
        <Card>
          <CardContent className="grid gap-6 p-6 sm:grid-cols-2">
            <Field label="Vendor name" value={vendor.vendor_name} />
            <Field label="Email" value={vendor.email} />
            <Field label="Phone" value={vendor.vendor_phone_number} />
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-mist">Status</p>
              <div className="mt-2">
                <VendorStatusBadge status={vendor.status} />
              </div>
            </div>
            <Field label="Invitation date" value={formatDateTime(vendor.invited_at)} />
            <Field label="Created" value={formatDateTime(vendor.created_at)} />
            <div className="sm:col-span-2">
              <Button variant="outline" onClick={() => void resend()}>
                Resend invitation email
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-mist">{label}</p>
      <p className="mt-2 text-ivory">{value || '—'}</p>
    </div>
  )
}
