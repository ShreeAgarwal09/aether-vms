import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { formatDateTime, VendorStatusBadge } from '@/components/company/VendorStatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { deleteVendor, fetchVendor, resendVendorInvite, setVendorBlocked } from '@/lib/vendor-api'
import type { Vendor } from '@/lib/types'

export function VendorDetailPage() {
  const { vendorId } = useParams()
  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)
  const [actionPending, setActionPending] = useState(false)

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
    if (!vendor || resending) return
    setResending(true)
    const result = await resendVendorInvite(vendor.id)
    setResending(false)
    setFeedback(result.error ?? result.message ?? 'Invitation processed.')
    if (result.inviteLink) setFeedback(`${result.message ?? 'Invitation updated.'} Link: ${result.inviteLink}`)
  }

  async function onDelete() {
    if (!vendor || actionPending) return
    setActionPending(true)
    const result = await deleteVendor(vendor.id)
    setActionPending(false)
    setDeleteOpen(false)
    setFeedback(result.error ?? result.message ?? 'Vendor deleted.')
    if (!result.error) setVendor(null)
  }

  async function onBlock() {
    if (!vendor || actionPending) return
    setActionPending(true)
    const result = await setVendorBlocked(vendor.id, true)
    setActionPending(false)
    setBlockOpen(false)
    setFeedback(result.error ?? result.message ?? 'Vendor blocked.')
    if (!result.error) setVendor({ ...vendor, status: 'blocked' })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Vendor details"
        title={vendor?.vendor_name || 'Vendor'}
        description="Invitation metadata for this vendor. Open Review to read the submitted onboarding package and approve or reject pending submissions."
        action={
          <div className="flex flex-wrap gap-3">
            {vendor && (vendor.status === 'pending' || vendor.status === 'approved' || vendor.status === 'rejected') ? (
              <Link
                to={`/company/vendors/${vendor.id}/review`}
                className="inline-flex h-11 items-center rounded-lg bg-gold px-4 text-sm font-medium text-ink"
              >
                {vendor.status === 'pending' ? 'Review submission' : 'View submission'}
              </Link>
            ) : null}
            <Link to="/company/vendors" className="text-sm text-gold hover:text-gold-bright">
              Back to vendors
            </Link>
          </div>
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
            <Field label="Submitted" value={formatDateTime(vendor.submitted_at ?? null)} />
            <Field label="BC sync" value={vendor.bc_sync_status ?? 'not_started'} />
            <Field label="Created" value={formatDateTime(vendor.created_at)} />
            {vendor.status === 'rejected' && vendor.rejection_reason ? (
              <div className="sm:col-span-2">
                <p className="text-xs uppercase tracking-[0.16em] text-mist">Rejection reason</p>
                <p className="mt-2 text-ivory">{vendor.rejection_reason}</p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <Button variant="outline" onClick={() => void resend()} disabled={resending}>
                {resending ? 'Sending…' : 'Resend invitation email'}
              </Button>
              {vendor.status !== 'approved' && vendor.status !== 'pending' && vendor.status !== 'blocked' ? (
                <Button variant="outline" onClick={() => setDeleteOpen(true)}>
                  Delete vendor
                </Button>
              ) : null}
              {vendor.status !== 'approved' && vendor.status !== 'blocked' ? (
                <Button variant="outline" onClick={() => setBlockOpen(true)}>
                  Block vendor
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog
        open={deleteOpen}
        title="Delete vendor record?"
        description="This permanently removes the invitation and any unsubmitted data."
        confirmLabel="Delete vendor"
        pending={actionPending}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void onDelete()}
      />
      <ConfirmDialog
        open={blockOpen}
        title="Block this vendor?"
        description="Blocked vendors cannot use their onboarding link until you resend a new invitation."
        confirmLabel="Block vendor"
        pending={actionPending}
        onClose={() => setBlockOpen(false)}
        onConfirm={() => void onBlock()}
      />
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
