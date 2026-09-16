import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { formatDateTime, VendorStatusBadge } from '@/components/company/VendorStatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  displayOrEmpty,
  fetchVendorReview,
  reviewVendor,
  signVendorDocument,
  type VendorReview,
} from '@/lib/review-api'
import { invokeBc } from '@/lib/integration-api'

const REJECT_HINTS = [
  'Missing information',
  'Incorrect information',
  'Invalid document',
  'Bank details issue',
  'GST issue',
  'Other',
]

export function VendorReviewPage() {
  const { vendorId = '' } = useParams()
  const navigate = useNavigate()
  const [review, setReview] = useState<VendorReview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [approveOpen, setApproveOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [revealedAccount, setRevealedAccount] = useState<string | null>(null)
  const [docBusy, setDocBusy] = useState<string | null>(null)

  const load = useCallback(async (revealAccount = false) => {
    if (!revealAccount) setLoading(true)
    const result = await fetchVendorReview(vendorId, revealAccount)
    if (result.error || !result.review) {
      setError(result.error ?? 'This vendor was not found in your company directory.')
      setReview(null)
    } else {
      setReview(result.review)
      setError(null)
      if (revealAccount) setRevealedAccount(result.review.bank.account_number ?? null)
    }
    setLoading(false)
  }, [vendorId])

  useEffect(() => {
    if (!vendorId) return
    void load(false)
  }, [vendorId, load])

  async function onApprove() {
    if (busy) return
    setBusy(true)
    const result = await reviewVendor(vendorId, 'approve')
    setBusy(false)
    setApproveOpen(false)
    if (result.error) {
      setNotice(result.error)
      return
    }
    setNotice(result.message ?? 'Vendor approved.')
    await load(false)
  }

  async function onValidate() {
    if (busy) return
    setBusy(true)
    const result = await invokeBc({ action: 'validate_vendor_for_bc', vendorId })
    setBusy(false)
    if (result.error) setNotice(String(result.error))
    else setNotice(String(result.message ?? 'Validation passed.'))
  }

  async function onBcSync(approveLocal: boolean) {
    if (busy) return
    setBusy(true)
    const result = await invokeBc({ action: 'sync_vendor_to_bc', vendorId, approveLocal })
    setBusy(false)
    setSyncOpen(false)
    if (result.error) setNotice(String(result.error))
    else setNotice(String(result.message ?? 'Business Central sync finished.'))
    await load(false)
  }

  async function onReject() {
    if (busy) return
    const trimmed = reason.trim()
    if (trimmed.length < 8) {
      setReasonError('Enter a meaningful reason (at least 8 characters).')
      return
    }
    if (trimmed.length > 1000) {
      setReasonError('Keep the reason under 1,000 characters.')
      return
    }
    setBusy(true)
    const result = await reviewVendor(vendorId, 'reject', trimmed)
    setBusy(false)
    if (result.error) {
      setReasonError(result.error)
      return
    }
    setRejectOpen(false)
    setReason('')
    setNotice(result.message ?? 'Vendor rejected.')
    await load(false)
  }

  async function openDocument(documentId: string) {
    setDocBusy(documentId)
    const result = await signVendorDocument(vendorId, documentId)
    setDocBusy(null)
    if (result.error || !result.url) {
      setNotice(result.error ?? 'Could not open the document.')
      return
    }
    window.open(result.url, '_blank', 'noopener,noreferrer')
  }

  const pending = review?.status === 'pending'
  const name = review?.basic.vendor_name || 'Vendor'

  return (
    <div className="space-y-6 pb-28">
      <PageHeader
        eyebrow="Vendor review"
        title={name}
        description="Read-only submission for your company. Approve and reject run on the server; this page never writes vendor status directly."
        action={
          <div className="flex flex-wrap gap-3">
            {review ? <VendorStatusBadge status={review.status} /> : null}
            <Link to="/company/vendors" className="text-sm text-gold hover:text-gold-bright">
              Back to vendors
            </Link>
          </div>
        }
      />

      {loading ? <div className="h-64 animate-pulse rounded-2xl bg-navy-800/80" /> : null}
      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-8 text-sm text-red-200">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-line bg-navy-900/80 px-4 py-3 text-sm text-mist">{notice}</div>
      ) : null}

      {review ? (
        <>
          <Card>
            <CardContent className="grid gap-4 p-6 sm:grid-cols-3">
              <Meta label="Submitted" value={formatDateTime(review.submitted_at)} />
              <Meta label="Resubmitted" value={formatDateTime(review.resubmitted_at)} />
              <Meta
                label="Form snapshot"
                value={
                  review.template_name
                    ? `${review.template_name}${review.template_version ? ` v${review.template_version}` : ''}`
                    : 'Not provided'
                }
              />
            </CardContent>
          </Card>

          {review.status === 'rejected' && review.rejection_reason ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Latest rejection reason: {review.rejection_reason}
            </div>
          ) : null}

          <Section title="Basic details">
            <Grid>
              <Field label="Vendor name" value={review.basic.vendor_name} />
              <Field label="Legal name" value={review.basic.legal_name} />
              <Field label="Vendor type" value={review.basic.vendor_type} />
              <Field label="Email" value={review.basic.email} />
              <Field label="Phone" value={review.basic.phone} />
            </Grid>
          </Section>

          <Section title="Contact persons">
            {review.contacts.length ? (
              <div className="space-y-3">
                {review.contacts.map((contact, index) => (
                  <div key={`${contact.email}-${index}`} className="rounded-xl border border-line p-4">
                    <Grid>
                      <Field label="Name" value={contact.name} />
                      <Field label="Designation" value={contact.designation} />
                      <Field label="Email" value={contact.email} />
                      <Field label="Mobile" value={contact.mobile} />
                      <Field label="Primary" value={contact.is_primary ? 'Yes' : 'No'} />
                    </Grid>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-mist">Not provided</p>
            )}
          </Section>

          <Section title="Address & GST">
            <Grid>
              <Field label="Registered address" value={review.address.registered_address} />
              <Field label="Address line" value={review.address.address_line} />
              <Field label="City" value={review.address.city} />
              <Field label="State" value={review.address.state} />
              <Field label="PIN" value={review.address.pin} />
              <Field label="Country" value={review.address.country} />
              <Field label="GST type" value={review.address.gst_registration_type} />
              <Field label="GSTIN" value={review.address.gst_number} />
            </Grid>
            <h3 className="mt-6 text-sm font-medium text-ivory">GST locations</h3>
            {review.gst_locations.length ? (
              <div className="mt-3 space-y-3">
                {review.gst_locations.map((location, index) => (
                  <div key={`${location.gstin}-${index}`} className="rounded-xl border border-line p-4">
                    <Grid>
                      <Field label="Location name" value={location.location_name} />
                      <Field label="Address" value={location.address} />
                      <Field label="City" value={location.city} />
                      <Field label="State" value={location.state} />
                      <Field label="PIN" value={location.pin} />
                      <Field label="GSTIN" value={location.gstin} />
                    </Grid>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-mist">Not provided</p>
            )}
          </Section>

          <Section title="Bank details">
            <Grid>
              <Field label="Bank name" value={review.bank.bank_name} />
              <Field label="Branch" value={review.bank.branch} />
              <Field label="Account holder" value={review.bank.account_holder} />
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-mist">Account number</p>
                <p className="mt-2 font-mono text-ivory">
                  {revealedAccount || review.bank.account_number_masked || 'Not provided'}
                </p>
                {review.bank.account_number_masked && !revealedAccount ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2 px-0"
                    onClick={() => void load(true)}
                  >
                    Reveal full account number
                  </Button>
                ) : null}
              </div>
              <Field label="IFSC" value={review.bank.ifsc} />
              <Field label="Account type" value={review.bank.account_type} />
            </Grid>
          </Section>

          <Section title="Company details">
            <Grid>
              <Field label="PAN" value={review.company.pan} />
              <Field label="Aadhaar" value={review.company.aadhaar} />
              <Field label="TDS information" value={review.company.tds_details} />
              <Field label="Assessee code" value={review.company.assessee_code} />
              <Field label="Registration / company no." value={review.company.company_registration} />
              <Field label="Company information" value={review.company.company_description} />
            </Grid>
          </Section>

          <Section title="Other details">
            <Grid>
              <Field label="MSME" value={review.other.msme} />
              <Field label="IEC" value={review.other.iec} />
              <Field label="Declaration" value={review.other.declaration_accurate} />
              <Field label="Additional information" value={review.other.additional_information} />
            </Grid>
          </Section>

          <Section title="Custom fields">
            {review.custom_fields.length ? (
              <Grid>
                {review.custom_fields.map((field) => (
                  <Field key={field.key} label={field.label} value={field.value} />
                ))}
              </Grid>
            ) : (
              <p className="text-sm text-mist">No custom Form Builder fields on this snapshot.</p>
            )}
          </Section>

          <Section title="Documents">
            {review.documents.length ? (
              <ul className="space-y-2">
                {review.documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3"
                  >
                    <div>
                      <p className="text-sm text-ivory">{doc.original_filename}</p>
                      <p className="text-xs uppercase tracking-[0.14em] text-mist">
                        {doc.document_type.replaceAll('_', ' ')}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={docBusy === doc.id}
                      onClick={() => void openDocument(doc.id)}
                    >
                      {docBusy === doc.id ? 'Opening…' : 'View / download'}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-mist">Not provided</p>
            )}
          </Section>

          <Section title="Integrations">
            <Grid>
              <Field label="Business Central" value={review.integration?.bc_sync_status} />
              <Field label="BC vendor ID" value={review.integration?.bc_vendor_id} />
              <Field label="BC vendor number" value={review.integration?.bc_vendor_number} />
              <Field label="BC last synced" value={review.integration?.bc_last_synced_at} />
              <Field label="Contacts" value={review.integration?.bc_contact_sync_status} />
              <Field label="GST locations" value={review.integration?.bc_gst_sync_status} />
              <Field label="Bank" value={review.integration?.bc_bank_sync_status} />
              <Field label="Documents" value={review.integration?.bc_document_sync_status} />
            </Grid>
            {review.integration?.bc_last_error ? (
              <p className="text-sm text-red-200">{review.integration.bc_last_error}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {pending ? (
                <Button variant="outline" disabled={busy} onClick={() => void onValidate()}>
                  {busy ? 'Validating…' : 'Validate for Business Central'}
                </Button>
              ) : null}
              {review.status === 'approved' ? (
                <Button variant="outline" disabled={busy} onClick={() => void onBcSync(false)}>
                  {busy ? 'Syncing…' : 'Retry Business Central'}
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-mist">
              Local Approve still works without Business Central. Extra GST locations and vendor bank accounts are not on the standard BC vendor API.
            </p>
          </Section>

          <Section title="Review history">
            {review.history.length ? (
              <ol className="space-y-3">
                {review.history.map((item) => (
                  <li key={item.id} className="rounded-xl border border-line px-4 py-3">
                    <p className="text-sm capitalize text-ivory">{item.action}</p>
                    <p className="text-xs text-mist">
                      {formatDateTime(item.created_at)}
                      {item.reviewer ? ` · ${item.reviewer}` : ''}
                    </p>
                    {item.reason ? <p className="mt-2 text-sm text-mist">{item.reason}</p> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-mist">No review events recorded yet.</p>
            )}
          </Section>

          {pending ? (
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-navy-950/95 px-4 py-4 backdrop-blur sm:px-8">
              <div className="mx-auto flex max-w-6xl flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button variant="outline" disabled={busy} onClick={() => setRejectOpen(true)}>
                  Reject
                </Button>
                <Button disabled={busy} onClick={() => setApproveOpen(true)}>
                  {busy ? 'Working…' : 'Approve vendor'}
                </Button>
                <Button disabled={busy} onClick={() => setSyncOpen(true)}>
                  Approve &amp; sync
                </Button>
              </div>
            </div>
          ) : null}

          <ConfirmDialog
            open={approveOpen}
            title="Approve this vendor?"
            description={`Approving ${name} is a business action. Local VMS status will become approved. This does not create a Business Central record.`}
            confirmLabel="Confirm approval"
            pending={busy}
            onClose={() => setApproveOpen(false)}
            onConfirm={() => void onApprove()}
          />
          <ConfirmDialog
            open={syncOpen}
            title="Approve and sync to Business Central?"
            description={`This validates ${name}, creates a vendor through the standard Business Central vendors API, then marks the VMS record approved if it is still pending. A second click will not create another BC vendor once a BC vendor ID is stored.`}
            confirmLabel="Approve & sync"
            pending={busy}
            onClose={() => setSyncOpen(false)}
            onConfirm={() => void onBcSync(true)}
          />

          <Dialog
            open={rejectOpen}
            title="Reject vendor"
            description="A rejection reason is required. The vendor can reopen the same secure onboarding link, edit their previous answers, and resubmit."
            onClose={() => !busy && setRejectOpen(false)}
          >
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {REJECT_HINTS.map((hint) => (
                  <button
                    key={hint}
                    type="button"
                    className="rounded-full border border-line px-3 py-1 text-xs text-mist hover:border-gold/40 hover:text-ivory"
                    onClick={() => setReason((current) => (current ? `${current} ${hint}: ` : `${hint}: `))}
                  >
                    {hint}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <Label htmlFor="rejection-reason">Rejection reason</Label>
                <Textarea
                  id="rejection-reason"
                  maxLength={1000}
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value)
                    setReasonError(null)
                  }}
                  placeholder="Explain what must be corrected. Do not paste bank numbers or Aadhaar."
                />
                <p className="text-xs text-mist">{reason.trim().length}/1000</p>
                {reasonError ? <p className="text-xs text-red-300">{reasonError}</p> : null}
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button variant="outline" disabled={busy} onClick={() => setRejectOpen(false)}>
                  Cancel
                </Button>
                <Button className="bg-red-500 text-white hover:bg-red-400" disabled={busy} onClick={() => void onReject()}>
                  {busy ? 'Working…' : 'Confirm rejection'}
                </Button>
              </div>
            </div>
          </Dialog>
        </>
      ) : null}

      {!loading && !error && review && !pending ? (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => navigate('/company/vendors')}>
            Return to vendor list
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <h2 className="font-display text-2xl text-ivory">{title}</h2>
        {children}
      </CardContent>
    </Card>
  )
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-5 sm:grid-cols-2">{children}</div>
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-mist">{label}</p>
      <p className="mt-2 whitespace-pre-wrap text-ivory">{displayOrEmpty(value)}</p>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-mist">{label}</p>
      <p className="mt-2 text-ivory">{value}</p>
    </div>
  )
}
