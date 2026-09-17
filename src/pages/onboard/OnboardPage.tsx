import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { DynamicFields } from '@/components/form-builder/DynamicFields'
import { ScreenState } from '@/components/ScreenState'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  ACCOUNT_TYPES,
  ALLOWED_UPLOAD_TYPES,
  emptyContact,
  emptyGstLocation,
  GST_FILING_FREQUENCIES,
  GST_TYPES,
  MAX_UPLOAD_BYTES,
  NATURE_OF_ENTITY_OPTIONS,
  STEP_TITLES,
  validateStep,
  VENDOR_TYPES,
  type ContactPerson,
  type DocRef,
  type GstLocation,
  type MasterAssessee,
  type MasterOption,
  type MasterState,
  type OnboardingForm,
  type SnapshotField,
} from '@/lib/onboarding'
import { DOCUMENT_LABELS, type VendorDocumentKind } from '@/lib/vendor-documents'
import { uploadVendorDocument, vendorOnboard } from '@/lib/onboarding-api'
import { cn } from '@/lib/utils'

export function OnboardPage() {
  const { token = '' } = useParams()
  const [loading, setLoading] = useState(true)
  const [invalid, setInvalid] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [rejected, setRejected] = useState(false)
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [vendorEmail, setVendorEmail] = useState('')
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<OnboardingForm | null>(null)
  const [fields, setFields] = useState<SnapshotField[]>([])
  const [masterData, setMasterData] = useState<{
    states: MasterState[]
    designations: MasterOption[]
    assessee_codes: MasterAssessee[]
  }>({ states: [], designations: [], assessee_codes: [] })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [banner, setBanner] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [review, setReview] = useState(false)
  const submitLock = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await vendorOnboard({ action: 'get_onboarding_data', token })
    if (result.error || !result.data) {
      setInvalid(true)
      setLoading(false)
      return
    }
    setCompanyName(result.data.company_name)
    setVendorEmail(result.data.vendor_email)
    setForm(result.data.form)
    setFields(result.data.fields)
    setMasterData(result.data.master_data ?? { states: [], designations: [], assessee_codes: [] })
    setStep(result.data.current_step || 1)
    setSubmitted(result.data.submitted)
    setRejected(result.data.status === 'rejected')
    setRejectionReason(result.data.rejection_reason ?? null)
    setInvalid(false)
    setLoading(false)
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  async function persist(next = form, currentStep = step) {
    if (!next) return { error: 'Form is not ready.' }
    setSaveState('saving')
    const result = await vendorOnboard({
      action: 'save_onboarding_progress',
      token,
      step: currentStep,
      form: next,
    })
    if (result.error) {
      setSaveState('failed')
      return result
    }
    if (result.data?.form) setForm(result.data.form)
    setSaveState('saved')
    return result
  }

  useEffect(() => {
    if (!form || submitted || invalid) return
    const handle = window.setTimeout(() => {
      void persist(form, step)
    }, 1800)
    return () => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, step, submitted, invalid])

  function patch(partial: Partial<OnboardingForm>) {
    setForm((current) => (current ? { ...current, ...partial } : current))
    setErrors({})
    setBanner(null)
  }

  async function goNext() {
    if (!form || saveState === 'saving') return
    const nextErrors = validateStep(step, form, fields, 'progress')
    if (step === 3 && !form.cancelled_cheque) nextErrors.cancelled_cheque = 'Upload a cancelled cheque.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      setBanner(Object.values(nextErrors)[0])
      return
    }
    const result = await persist(form, step)
    if (result?.error) {
      setBanner(result.error)
      return
    }
    if (step === 5) {
      setReview(true)
      return
    }
    setStep(step + 1)
  }

  async function submit() {
    if (!form || submitLock.current) return
    const all = {
      ...validateStep(1, form, fields, 'submit'),
      ...validateStep(2, form, fields, 'submit'),
      ...validateStep(3, form, fields, 'submit'),
      ...validateStep(4, form, fields, 'submit'),
      ...validateStep(5, form, fields, 'submit'),
    }
    if (!form.cancelled_cheque) all.cancelled_cheque = 'Upload a cancelled cheque.'
    setErrors(all)
    if (Object.keys(all).length) {
      setBanner('Vendor validation failed. Please review the highlighted fields.')
      setReview(false)
      return
    }
    submitLock.current = true
    setSaveState('saving')
    const result = await vendorOnboard({ action: 'submit_vendor', token, step: 5, form })
    submitLock.current = false
    if (result.error) {
      setSaveState('failed')
      setBanner(result.error)
      return
    }
    setSubmitted(true)
    setSaveState('saved')
  }

  async function onFile(kind: VendorDocumentKind, fileList: FileList | null, locationId?: string) {
    const file = fileList?.[0]
    if (!file || !form) return
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
      setBanner('Allowed types: PDF, JPEG, PNG, WebP.')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setBanner('File must be 10 MB or smaller.')
      return
    }
    setUploading(locationId ? `${kind}:${locationId}` : kind)
    let activeForm = form
    let resolvedLocationId = locationId
    if (kind === 'gst_location') {
      const saved = await persist(form, 2)
      if (saved?.error) {
        setUploading(null)
        setBanner(saved.error)
        return
      }
      if (saved?.data?.form) {
        activeForm = saved.data.form
        if (locationId) {
          const index = form.gst_locations.findIndex((item) => item.id === locationId)
          resolvedLocationId = index >= 0 ? activeForm.gst_locations[index]?.id ?? locationId : locationId
        }
      }
    }
    const result = await uploadVendorDocument(token, kind, file, resolvedLocationId)
    setUploading(null)
    if (result.error || !result.document) {
      setBanner(result.error ?? 'Upload failed.')
      return
    }
    applyUploadedDocument(activeForm, kind, result.document, resolvedLocationId)
  }

  function applyUploadedDocument(
    current: OnboardingForm,
    kind: VendorDocumentKind,
    document: DocRef,
    locationId?: string,
  ) {
    if (kind === 'supporting_document') {
      patch({
        supporting_docs: [...current.supporting_docs.filter((item) => item.id !== document.id), document],
      })
      return
    }
    if (kind === 'gst_location' && locationId) {
      patch({
        gst_locations: current.gst_locations.map((item) =>
          item.id === locationId ? { ...item, gst_file: document } : item,
        ),
      })
      return
    }
    const fieldMap: Partial<Record<VendorDocumentKind, keyof OnboardingForm>> = {
      cancelled_cheque: 'cancelled_cheque',
      gst_certificate: 'gst_certificate',
      pan_card: 'pan_card',
      aadhaar_card: 'aadhaar_card',
      aadhaar_declaration: 'aadhaar_declaration',
      msme_certificate: 'msme_certificate',
      e_invoice: 'e_invoice',
      declaration_non_e_invoicing: 'declaration_non_e_invoicing',
      udhyam_certificate: 'udhyam_certificate',
      declaration_194q: 'declaration_194q',
      declaration_206ab: 'declaration_206ab',
    }
    const key = fieldMap[kind]
    if (key) patch({ [key]: document } as Partial<OnboardingForm>)
  }

  if (loading) {
    return <ScreenState title="Checking invitation" body="Validating your secure onboarding link…" loading />
  }
  if (invalid || !form) {
    return (
      <ScreenState
        title="Invalid or expired invitation"
        body="This link is not valid. Ask the company to send a new invitation. For security, we cannot say why a guessed link failed."
      />
    )
  }
  if (submitted) {
    return (
      <VendorShell companyName={companyName} saveState={saveState}>
        <Card className="mx-auto max-w-xl">
          <CardContent className="space-y-3 p-8 text-center">
            <p className="text-xs uppercase tracking-[0.18em] text-gold">Submitted</p>
            <h1 className="font-display text-3xl text-ivory">Onboarding received</h1>
            <p className="text-sm leading-6 text-mist">
              Your information was submitted to {companyName} and is awaiting company review. You do not need an account.
            </p>
          </CardContent>
        </Card>
      </VendorShell>
    )
  }

  return (
    <VendorShell companyName={companyName} saveState={saveState}>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-gold">Vendor onboarding</p>
          <h1 className="mt-2 font-display text-3xl text-ivory sm:text-4xl">{companyName}</h1>
          <p className="mt-2 text-sm text-mist">
            Invitation for {vendorEmail}. This link is your access — no vendor login is created.
          </p>
        </div>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {STEP_TITLES.map((title, index) => (
            <li
              key={title}
              className={cn(
                'rounded-xl border px-3 py-2 text-xs',
                step === index + 1 ? 'border-gold/50 bg-gold/10 text-gold' : 'border-line text-mist',
              )}
            >
              <span className="block uppercase tracking-[0.14em]">Step {index + 1}</span>
              {title}
            </li>
          ))}
        </ol>
        {rejected && rejectionReason ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
            <p className="font-medium text-ivory">Your submission requires changes</p>
            <p className="mt-2 leading-6">{rejectionReason}</p>
            <p className="mt-2 text-xs text-mist">
              Previous answers are restored below. Update what the company requested, then submit again.
            </p>
          </div>
        ) : null}

        {banner ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{banner}</div>
        ) : null}

        {review ? (
          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="font-display text-2xl text-ivory">Review & submit</h2>
              <p className="text-sm text-mist">
                Aadhaar is stored as a hash plus last four digits only. GSTIN format is checked, not government-verified.
              </p>
              <Summary form={form} />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setReview(false)} disabled={saveState === 'saving'}>
                  Back to edit
                </Button>
                <Button onClick={() => void submit()} disabled={saveState === 'saving'}>
                  {saveState === 'saving' ? 'Submitting…' : 'Submit for review'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="space-y-5 p-6">
              {step === 1 ? (
                <StepBasic form={form} errors={errors} patch={patch} masterData={masterData} />
              ) : null}
              {step === 2 ? (
                <StepAddress
                  form={form}
                  errors={errors}
                  patch={patch}
                  masterData={masterData}
                  uploading={uploading}
                  onFile={onFile}
                />
              ) : null}
              {step === 3 ? (
                <StepBank form={form} errors={errors} patch={patch} uploading={uploading} onFile={onFile} />
              ) : null}
              {step === 4 ? (
                <StepCompany
                  form={form}
                  errors={errors}
                  patch={patch}
                  masterData={masterData}
                  uploading={uploading}
                  onFile={onFile}
                />
              ) : null}
              {step === 5 ? (
                <StepOther form={form} errors={errors} fields={fields} patch={patch} uploading={uploading} onFile={onFile} />
              ) : null}
              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="outline" disabled={step === 1 || saveState === 'saving'} onClick={() => setStep((value) => Math.max(1, value - 1))}>
                  Back
                </Button>
                <Button onClick={() => void goNext()} disabled={saveState === 'saving'}>
                  {saveState === 'saving' ? 'Saving…' : step === 5 ? 'Review' : 'Next'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </VendorShell>
  )
}

function VendorShell({
  companyName,
  saveState,
  children,
}: {
  companyName: string
  saveState: string
  children: ReactNode
}) {
  const saveLabel =
    saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'failed' ? 'Save failed' : ''
  return (
    <div className="min-h-svh px-4 py-8 sm:px-6">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 pb-8">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Aether VMS</p>
          <p className="text-sm text-mist">{companyName}</p>
        </div>
        <p className="text-xs text-mist" aria-live="polite">
          {saveLabel}
        </p>
      </header>
      {children}
    </div>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-red-300">{message}</p>
}

function StepBasic({
  form,
  errors,
  patch,
  masterData,
}: {
  form: OnboardingForm
  errors: Record<string, string>
  patch: (partial: Partial<OnboardingForm>) => void
  masterData: { designations: MasterOption[] }
}) {
  function updateContact(index: number, next: Partial<ContactPerson>) {
    patch({
      contacts: form.contacts.map((contact, contactIndex) =>
        contactIndex === index ? { ...contact, ...next } : contact,
      ),
    })
  }
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl text-ivory">Basic details</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <ReadOnlyField label="Company no." value={form.company_no} />
        <ReadOnlyField label="Company name" value={form.company_name} />
        <ReadOnlyField label="Vendor email" value={form.vendor_email} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="vendor_name">Vendor / company name *</Label>
        <Input id="vendor_name" value={form.vendor_name} onChange={(event) => patch({ vendor_name: event.target.value })} />
        <FieldError message={errors.vendor_name} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="legal_name">Legal name</Label>
        <Input id="legal_name" value={form.legal_name} onChange={(event) => patch({ legal_name: event.target.value })} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="vendor_type">Vendor type *</Label>
        <select
          id="vendor_type"
          className="h-11 w-full rounded-lg border border-line bg-navy-950/70 px-3.5 text-sm text-ivory"
          value={form.vendor_type}
          onChange={(event) => patch({ vendor_type: event.target.value })}
        >
          <option value="">Select</option>
          {VENDOR_TYPES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <FieldError message={errors.vendor_type} />
      </div>
      <div className="flex items-center justify-between">
        <h3 className="text-ivory">Contact persons</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => patch({ contacts: [...form.contacts, { ...emptyContact(), is_primary: false }] })}
        >
          Add contact
        </Button>
      </div>
      <FieldError message={errors.contacts} />
      {form.contacts.map((contact, index) => (
        <div key={contact.id} className="space-y-3 rounded-xl border border-line p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledInput label="Name *" value={contact.name} error={errors[`contact_${index}_name`]} onChange={(value) => updateContact(index, { name: value })} />
            <DesignationField
              label="Designation"
              value={contact.designation}
              options={masterData.designations}
              onChange={(value) => updateContact(index, { designation: value })}
            />
            <LabeledInput label="Email *" value={contact.email} error={errors[`contact_${index}_email`]} onChange={(value) => updateContact(index, { email: value })} />
            <LabeledInput label="Mobile *" value={contact.mobile} error={errors[`contact_${index}_mobile`]} onChange={(value) => updateContact(index, { mobile: value })} />
            <LabeledInput label="Alternate phone" value={contact.alternate_phone} error={errors[`contact_${index}_alternate`]} onChange={(value) => updateContact(index, { alternate_phone: value })} />
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 text-sm text-mist">
              <input
                type="radio"
                name="primary-contact"
                checked={contact.is_primary}
                onChange={() =>
                  patch({
                    contacts: form.contacts.map((item, itemIndex) => ({ ...item, is_primary: itemIndex === index })),
                  })
                }
              />
              Primary contact
            </label>
            {form.contacts.length > 1 ? (
              <Button variant="ghost" size="sm" onClick={() => patch({ contacts: form.contacts.filter((item) => item.id !== contact.id) })}>
                Remove
              </Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

function StepAddress({
  form,
  errors,
  patch,
  masterData,
  uploading,
  onFile,
}: {
  form: OnboardingForm
  errors: Record<string, string>
  patch: (partial: Partial<OnboardingForm>) => void
  masterData: { states: MasterState[] }
  uploading: string | null
  onFile: (kind: VendorDocumentKind, fileList: FileList | null, locationId?: string) => void
}) {
  function updateGst(index: number, next: Partial<GstLocation>) {
    patch({
      gst_locations: form.gst_locations.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item)),
    })
  }
  const gstRegistered = form.registered_under_gst === true
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl text-ivory">Address & GST</h2>
      <div className="space-y-2">
        <Label>Registered address *</Label>
        <Textarea value={form.registered_address} onChange={(event) => patch({ registered_address: event.target.value })} />
        <FieldError message={errors.registered_address} />
      </div>
      <LabeledInput label="Address line 1 *" value={form.address_line} error={errors.address_line} onChange={(value) => patch({ address_line: value })} />
      <LabeledInput label="Address line 2" value={form.address_line2} onChange={(value) => patch({ address_line2: value })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledInput label="City *" value={form.city} error={errors.city} onChange={(value) => patch({ city: value })} />
        <StateSelect label="State *" value={form.state} error={errors.state} states={masterData.states} onChange={(value) => patch({ state: value })} />
        <LabeledInput label="PIN code *" value={form.pin} error={errors.pin} onChange={(value) => patch({ pin: value })} />
        <LabeledInput label="Country *" value={form.country} onChange={(value) => patch({ country: value })} />
      </div>
      <YesNoField
        label="Registered under GST? *"
        value={form.registered_under_gst}
        error={errors.registered_under_gst}
        onChange={(value) =>
          patch({
            registered_under_gst: value,
            gst_registration_type: value ? form.gst_registration_type : 'Unregistered',
          })
        }
      />
      {gstRegistered ? (
        <>
          <div className="space-y-2">
            <Label>GST registration type *</Label>
            <select
              className="h-11 w-full rounded-lg border border-line bg-navy-950/70 px-3.5 text-sm text-ivory"
              value={form.gst_registration_type}
              onChange={(event) => patch({ gst_registration_type: event.target.value })}
            >
              <option value="">Select</option>
              {GST_TYPES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <FieldError message={errors.gst_registration_type} />
          </div>
          {form.gst_registration_type !== 'Unregistered' ? (
            <LabeledInput
              label="GST number *"
              value={form.gst_number}
              error={errors.gst_number}
              onChange={(value) => patch({ gst_number: value.toUpperCase() })}
            />
          ) : null}
          <FileUploadField
            label={DOCUMENT_LABELS.gst_certificate}
            document={form.gst_certificate}
            uploading={uploading === 'gst_certificate'}
            error={errors.gst_certificate}
            onFile={(files) => onFile('gst_certificate', files)}
          />
          <div className="space-y-2">
            <Label>GST filing frequency *</Label>
            <select
              className="h-11 w-full rounded-lg border border-line bg-navy-950/70 px-3.5 text-sm text-ivory"
              value={form.gst_filing_frequency}
              onChange={(event) => patch({ gst_filing_frequency: event.target.value })}
            >
              <option value="">Select</option>
              {GST_FILING_FREQUENCIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <FieldError message={errors.gst_filing_frequency} />
          </div>
          <label className="flex items-center gap-2 text-sm text-mist">
            <input
              type="checkbox"
              checked={form.more_than_one_gst}
              onChange={(event) => patch({ more_than_one_gst: event.target.checked })}
            />
            More than one GST location
          </label>
          {form.more_than_one_gst ? (
            <LabeledInput
              label="Number of locations *"
              value={form.number_of_gst_locations}
              error={errors.number_of_gst_locations}
              onChange={(value) => patch({ number_of_gst_locations: value })}
            />
          ) : null}
        </>
      ) : null}
      <p className="text-xs text-mist">GSTIN format is checked locally. This is not government GSTIN verification.</p>
      {form.more_than_one_gst ? (
        <>
          <FieldError message={errors.gst_locations} />
          <div className="flex items-center justify-between">
            <h3 className="text-ivory">Additional GST locations</h3>
            <Button variant="outline" size="sm" onClick={() => patch({ gst_locations: [...form.gst_locations, emptyGstLocation()] })}>
              Add GST location
            </Button>
          </div>
          {form.gst_locations.map((location, index) => (
            <div key={location.id} className="space-y-3 rounded-xl border border-line p-4">
              <LabeledInput label="Location name *" value={location.location_name} error={errors[`gst_${index}_name`]} onChange={(value) => updateGst(index, { location_name: value })} />
              <LabeledInput label="Address line 1 *" value={location.address} error={errors[`gst_${index}_address`]} onChange={(value) => updateGst(index, { address: value })} />
              <LabeledInput label="Address line 2" value={location.address_line2} onChange={(value) => updateGst(index, { address_line2: value })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <LabeledInput label="City *" value={location.city} error={errors[`gst_${index}_city`]} onChange={(value) => updateGst(index, { city: value })} />
                <StateSelect label="State *" value={location.state} error={errors[`gst_${index}_state`]} states={masterData.states} onChange={(value) => updateGst(index, { state: value })} />
                <LabeledInput label="PIN *" value={location.pin} error={errors[`gst_${index}_pin`]} onChange={(value) => updateGst(index, { pin: value })} />
                <LabeledInput label="GSTIN *" value={location.gstin} error={errors[`gst_${index}_gstin`]} onChange={(value) => updateGst(index, { gstin: value.toUpperCase() })} />
              </div>
              <FileUploadField
                label={DOCUMENT_LABELS.gst_location}
                document={location.gst_file}
                uploading={uploading === `gst_location:${location.id}`}
                error={errors[`gst_${index}_file`]}
                onFile={(files) => onFile('gst_location', files, location.id)}
              />
              <Button variant="ghost" size="sm" onClick={() => patch({ gst_locations: form.gst_locations.filter((item) => item.id !== location.id) })}>
                Remove
              </Button>
            </div>
          ))}
        </>
      ) : null}
    </div>
  )
}

function StepBank({
  form,
  errors,
  patch,
  uploading,
  onFile,
}: {
  form: OnboardingForm
  errors: Record<string, string>
  patch: (partial: Partial<OnboardingForm>) => void
  uploading: string | null
  onFile: (kind: VendorDocumentKind, fileList: FileList | null, locationId?: string) => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl text-ivory">Bank details</h2>
      <LabeledInput label="Vendor name as per bank *" value={form.account_holder_name} error={errors.account_holder_name} onChange={(value) => patch({ account_holder_name: value })} />
      <LabeledInput label="Vendor email as per bank" value={form.vendor_email_as_per_bank} error={errors.vendor_email_as_per_bank} onChange={(value) => patch({ vendor_email_as_per_bank: value })} />
      <LabeledInput label="Bank name *" value={form.bank_name} error={errors.bank_name} onChange={(value) => patch({ bank_name: value })} />
      <LabeledInput label="Account number *" value={form.account_number} error={errors.account_number} onChange={(value) => patch({ account_number: value })} />
      <LabeledInput label="IFSC *" value={form.ifsc} error={errors.ifsc} onChange={(value) => patch({ ifsc: value.toUpperCase() })} />
      <LabeledInput label="Branch *" value={form.branch} error={errors.branch} onChange={(value) => patch({ branch: value })} />
      <div className="space-y-2">
        <Label>Account type *</Label>
        <select
          className="h-11 w-full rounded-lg border border-line bg-navy-950/70 px-3.5 text-sm text-ivory"
          value={form.account_type}
          onChange={(event) => patch({ account_type: event.target.value })}
        >
          <option value="">Select</option>
          {ACCOUNT_TYPES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <FieldError message={errors.account_type} />
      </div>
      <FileUploadField
        label={`${DOCUMENT_LABELS.cancelled_cheque} *`}
        document={form.cancelled_cheque}
        uploading={uploading === 'cancelled_cheque'}
        error={errors.cancelled_cheque}
        onFile={(files) => onFile('cancelled_cheque', files)}
      />
    </div>
  )
}

function StepCompany({
  form,
  errors,
  patch,
  masterData,
  uploading,
  onFile,
}: {
  form: OnboardingForm
  errors: Record<string, string>
  patch: (partial: Partial<OnboardingForm>) => void
  masterData: { assessee_codes: MasterAssessee[] }
  uploading: string | null
  onFile: (kind: VendorDocumentKind, fileList: FileList | null, locationId?: string) => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl text-ivory">Company details</h2>
      <LabeledInput label="Website URL" value={form.website_url} error={errors.website_url} onChange={(value) => patch({ website_url: value })} />
      <AssesseeField
        label="Assessee code *"
        value={form.assessee_code}
        error={errors.assessee_code}
        options={masterData.assessee_codes}
        onChange={(value) => patch({ assessee_code: value })}
      />
      <div className="space-y-2">
        <Label>Nature of entity *</Label>
        <select
          className="h-11 w-full rounded-lg border border-line bg-navy-950/70 px-3.5 text-sm text-ivory"
          value={form.nature_of_entity}
          onChange={(event) => patch({ nature_of_entity: event.target.value })}
        >
          <option value="">Select</option>
          {NATURE_OF_ENTITY_OPTIONS.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <FieldError message={errors.nature_of_entity} />
      </div>
      <LabeledInput label="PAN *" value={form.pan} error={errors.pan} onChange={(value) => patch({ pan: value.toUpperCase() })} />
      <FileUploadField
        label={DOCUMENT_LABELS.pan_card}
        document={form.pan_card}
        uploading={uploading === 'pan_card'}
        error={errors.pan_card}
        onFile={(files) => onFile('pan_card', files)}
      />
      <div className="space-y-2">
        <Label htmlFor="aadhaar">Aadhaar *</Label>
        <Input
          id="aadhaar"
          autoComplete="off"
          value={form.aadhaar_input}
          onChange={(event) => patch({ aadhaar_input: event.target.value.replace(/\D/g, '').slice(0, 12) })}
          placeholder={form.aadhaar_masked ? `Saved as ${form.aadhaar_masked}` : '12 digits'}
        />
        <p className="text-xs text-mist">
          Only a one-way hash and the last four digits are stored. Leave blank to keep a previously saved value.
        </p>
        <FieldError message={errors.aadhaar_input} />
      </div>
      <FileUploadField
        label={DOCUMENT_LABELS.aadhaar_card}
        document={form.aadhaar_card}
        uploading={uploading === 'aadhaar_card'}
        error={errors.aadhaar_card}
        onFile={(files) => onFile('aadhaar_card', files)}
      />
      <FileUploadField
        label={DOCUMENT_LABELS.aadhaar_declaration}
        document={form.aadhaar_declaration}
        uploading={uploading === 'aadhaar_declaration'}
        error={errors.aadhaar_declaration}
        onFile={(files) => onFile('aadhaar_declaration', files)}
      />
      <LabeledInput label="TDS deduction rate (%)" value={form.tds_deduction_rate} error={errors.tds_deduction_rate} onChange={(value) => patch({ tds_deduction_rate: value })} />
      <div className="space-y-2">
        <Label>TDS details</Label>
        <Textarea value={form.tds_details} onChange={(event) => patch({ tds_details: event.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>Company description</Label>
        <Textarea value={form.company_description} onChange={(event) => patch({ company_description: event.target.value })} />
      </div>
    </div>
  )
}

function StepOther({
  form,
  errors,
  fields,
  patch,
  uploading,
  onFile,
}: {
  form: OnboardingForm
  errors: Record<string, string>
  fields: SnapshotField[]
  patch: (partial: Partial<OnboardingForm>) => void
  uploading: string | null
  onFile: (kind: VendorDocumentKind, fileList: FileList | null, locationId?: string) => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl text-ivory">Other details</h2>
      <label className="flex items-center gap-2 text-sm text-mist">
        <input type="checkbox" checked={form.msme} onChange={(event) => patch({ msme: event.target.checked })} />
        Registered under MSME
      </label>
      {form.msme ? (
        <>
          <LabeledInput label="MSME number *" value={form.msme_number} error={errors.msme_number} onChange={(value) => patch({ msme_number: value })} />
          <FileUploadField
            label={DOCUMENT_LABELS.msme_certificate}
            document={form.msme_certificate}
            uploading={uploading === 'msme_certificate'}
            error={errors.msme_certificate}
            onFile={(files) => onFile('msme_certificate', files)}
          />
          <FileUploadField
            label={DOCUMENT_LABELS.udhyam_certificate}
            document={form.udhyam_certificate}
            uploading={uploading === 'udhyam_certificate'}
            error={errors.udhyam_certificate}
            onFile={(files) => onFile('udhyam_certificate', files)}
          />
        </>
      ) : null}
      <label className="flex items-center gap-2 text-sm text-mist">
        <input type="checkbox" checked={form.iec_registered} onChange={(event) => patch({ iec_registered: event.target.checked })} />
        IEC registered
      </label>
      {form.iec_registered ? (
        <>
          <LabeledInput label="IEC number *" value={form.iec_number} error={errors.iec_number} onChange={(value) => patch({ iec_number: value })} />
          <FileUploadField
            label={DOCUMENT_LABELS.e_invoice}
            document={form.e_invoice}
            uploading={uploading === 'e_invoice'}
            error={errors.e_invoice}
            onFile={(files) => onFile('e_invoice', files)}
          />
        </>
      ) : null}
      <FileUploadField
        label={DOCUMENT_LABELS.declaration_non_e_invoicing}
        document={form.declaration_non_e_invoicing}
        uploading={uploading === 'declaration_non_e_invoicing'}
        error={errors.declaration_non_e_invoicing}
        onFile={(files) => onFile('declaration_non_e_invoicing', files)}
      />
      <FileUploadField
        label={DOCUMENT_LABELS.declaration_194q}
        document={form.declaration_194q}
        uploading={uploading === 'declaration_194q'}
        error={errors.declaration_194q}
        onFile={(files) => onFile('declaration_194q', files)}
      />
      <FileUploadField
        label={DOCUMENT_LABELS.declaration_206ab}
        document={form.declaration_206ab}
        uploading={uploading === 'declaration_206ab'}
        error={errors.declaration_206ab}
        onFile={(files) => onFile('declaration_206ab', files)}
      />
      <div className="space-y-2">
        <Label>Additional information</Label>
        <Textarea value={form.additional_information} onChange={(event) => patch({ additional_information: event.target.value })} />
      </div>
      <FileUploadField
        label={`${DOCUMENT_LABELS.supporting_document} (optional)`}
        document={null}
        uploading={uploading === 'supporting_document'}
        onFile={(files) => onFile('supporting_document', files)}
      />
      {form.supporting_docs.length ? (
        <ul className="text-sm text-mist">
          {form.supporting_docs.map((doc) => (
            <li key={doc.id ?? doc.filename}>{doc.filename}</li>
          ))}
        </ul>
      ) : null}
      {fields.length ? (
        <div className="space-y-3 rounded-xl border border-line p-4">
          <h3 className="text-ivory">Company template fields</h3>
          <DynamicFields
            fields={fields}
            values={form.custom}
            errors={errors}
            onChange={(key, value) => patch({ custom: { ...form.custom, [key]: value } })}
          />
        </div>
      ) : null}
      <label className="flex items-start gap-2 text-sm text-mist">
        <input
          type="checkbox"
          className="mt-1"
          checked={form.declaration_accurate}
          onChange={(event) => patch({ declaration_accurate: event.target.checked })}
        />
        I declare that the information provided is true and complete to the best of my knowledge.
      </label>
      <FieldError message={errors.declaration_accurate} />
    </div>
  )
}

function Summary({ form }: { form: OnboardingForm }) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <Item label="Vendor" value={form.vendor_name} />
      <Item label="Company no." value={form.company_no} />
      <Item label="Primary contact" value={form.contacts.find((item) => item.is_primary)?.name} />
      <Item label="City" value={`${form.city}, ${form.state} ${form.pin}`} />
      <Item label="GST registered" value={form.registered_under_gst ? 'Yes' : 'No'} />
      <Item label="GSTIN" value={form.gst_number || 'Not provided'} />
      <Item label="Bank" value={`${form.bank_name} / ${form.ifsc}`} />
      <Item label="PAN" value={form.pan} />
      <Item label="Aadhaar" value={form.aadhaar_masked || (form.aadhaar_input ? `XXXX-XXXX-${form.aadhaar_input.slice(-4)}` : '—')} />
      <Item label="MSME" value={form.msme ? form.msme_number : 'No'} />
      <Item label="Documents uploaded" value={countUploadedDocuments(form).toString()} />
    </dl>
  )
}

function countUploadedDocuments(form: OnboardingForm) {
  const singles = [
    form.cancelled_cheque,
    form.gst_certificate,
    form.pan_card,
    form.aadhaar_card,
    form.aadhaar_declaration,
    form.msme_certificate,
    form.e_invoice,
    form.declaration_non_e_invoicing,
    form.udhyam_certificate,
    form.declaration_194q,
    form.declaration_206ab,
  ]
  const locationDocs = form.gst_locations.filter((item) => item.gst_file).length
  return singles.filter(Boolean).length + locationDocs + form.supporting_docs.length
}

function ReadOnlyField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value || '—'} readOnly className="bg-navy-900/60 text-mist" />
    </div>
  )
}

function StateSelect({
  label,
  value,
  error,
  states,
  onChange,
}: {
  label: string
  value: string
  error?: string
  states: MasterState[]
  onChange: (value: string) => void
}) {
  const id = label.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="h-11 w-full rounded-lg border border-line bg-navy-950/70 px-3.5 text-sm text-ivory"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select state / UT</option>
        {value && !states.some((state) => state.code === value) ? (
          <option value={value}>{value}</option>
        ) : null}
        {states.map((state) => (
          <option key={state.code} value={state.code}>
            {state.label}
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </div>
  )
}

function YesNoField({
  label,
  value,
  error,
  onChange,
}: {
  label: string
  value: boolean | null
  error?: string
  onChange: (value: boolean) => void
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-4 text-sm text-mist">
        <label className="flex items-center gap-2">
          <input type="radio" name={label} checked={value === true} onChange={() => onChange(true)} />
          Yes
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name={label} checked={value === false} onChange={() => onChange(false)} />
          No
        </label>
      </div>
      <FieldError message={error} />
    </div>
  )
}

function DesignationField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: MasterOption[]
  onChange: (value: string) => void
}) {
  if (!options.length) {
    return <LabeledInput label={label} value={value} onChange={onChange} />
  }
  const id = label.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="h-11 w-full rounded-lg border border-line bg-navy-950/70 px-3.5 text-sm text-ivory"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select designation</option>
        {options.map((option) => (
          <option key={option.id} value={option.label}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function AssesseeField({
  label,
  value,
  error,
  options,
  onChange,
}: {
  label: string
  value: string
  error?: string
  options: MasterAssessee[]
  onChange: (value: string) => void
}) {
  if (!options.length) {
    return <LabeledInput label={label} value={value} error={error} onChange={onChange} />
  }
  const id = label.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="h-11 w-full rounded-lg border border-line bg-navy-950/70 px-3.5 text-sm text-ivory"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select assessee code</option>
        {options.map((option) => (
          <option key={option.id} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </div>
  )
}

function FileUploadField({
  label,
  document,
  uploading,
  error,
  onFile,
}: {
  label: string
  document: DocRef | null
  uploading?: boolean
  error?: string
  onFile: (files: FileList | null) => void
}) {
  const id = label.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => onFile(event.target.files)} />
      <p className="text-xs text-mist">
        {uploading ? 'Uploading…' : document ? `Uploaded: ${document.filename}` : 'PDF or image, 10 MB max. Stored privately.'}
      </p>
      <FieldError message={error} />
    </div>
  )
}

function Item({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.14em] text-mist">{label}</dt>
      <dd className="mt-1 text-ivory">{value || '—'}</dd>
    </div>
  )
}

function LabeledInput({
  label,
  value,
  error,
  onChange,
}: {
  label: string
  value: string
  error?: string
  onChange: (value: string) => void
}) {
  const id = label.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
      <FieldError message={error} />
    </div>
  )
}
