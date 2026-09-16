import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  AADHAAR_RE,
  ALLOWED_MIME,
  EMAIL_RE,
  GST_RE,
  IFSC_RE,
  MAX_FILE,
  PAN_RE,
  PHONE_RE,
  PIN_RE,
  clean,
  clip,
  json,
  sha256Hex,
  type SnapshotField,
} from './load.ts'

export {
  clean,
  corsHeaders,
  ensureSnapshot,
  inviteUsable,
  invalid,
  json,
  loadVendor,
  publicPayload,
  rateLimit,
  snapshotFields,
  clientIp,
} from './load.ts'

export function validateCustom(fields: SnapshotField[], custom: Record<string, unknown>, submit: boolean) {
  const errors: string[] = []
  for (const field of fields) {
    const value = custom[field.field_key]
    if (submit && field.is_required) {
      if (field.field_type === 'checkbox' && value !== true) errors.push(`${field.label} is required.`)
      else if (value === undefined || value === null || String(value).trim() === '') errors.push(`${field.label} is required.`)
    }
    if (value === undefined || value === null || value === '') continue
    if (field.field_type === 'email' && (typeof value !== 'string' || !EMAIL_RE.test(value))) {
      errors.push(`${field.label} must be a valid email.`)
    }
    if (field.field_type === 'integer') {
      const number = Number(value)
      if (!Number.isInteger(number)) errors.push(`${field.label} must be a whole number.`)
      const min = field.validation_rules?.min
      const max = field.validation_rules?.max
      if (typeof min === 'number' && number < min) errors.push(`${field.label} is below the minimum.`)
      if (typeof max === 'number' && number > max) errors.push(`${field.label} is above the maximum.`)
    }
    if (field.field_type === 'text' && typeof value === 'string') {
      const minLength = field.validation_rules?.minLength
      const maxLength = field.validation_rules?.maxLength
      if (typeof minLength === 'number' && value.length < minLength) errors.push(`${field.label} is too short.`)
      if (typeof maxLength === 'number' && value.length > maxLength) errors.push(`${field.label} is too long.`)
    }
    if (field.field_type === 'dropdown' || field.field_type === 'radio') {
      const allowed = (field.options ?? []).map((option) => option.value)
      if (typeof value !== 'string' || !allowed.includes(value)) errors.push(`${field.label} has an invalid option.`)
    }
      if (field.field_type === 'checkbox' && typeof value !== 'boolean') errors.push(`${field.label} is invalid.`)
    if (field.field_type === 'datetime') {
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        errors.push(`${field.label} must be a valid date.`)
      }
    }
  }
  const allowedKeys = new Set(fields.map((field) => field.field_key))
  for (const key of Object.keys(custom)) {
    if (!allowedKeys.has(key)) errors.push('Unexpected custom field.')
  }
  return errors
}

export function validateCore(form: Record<string, unknown>, step: number, submit: boolean) {
  const errors: string[] = []
  const contacts = Array.isArray(form.contacts) ? form.contacts : []
  if (step >= 1) {
    if (!clean(form.vendor_name)) errors.push('Vendor name is required.')
    if (!clean(form.vendor_type)) errors.push('Vendor type is required.')
    if (!contacts.length) errors.push('Add a contact person.')
    if (contacts.filter((item: Record<string, unknown>) => item.is_primary).length !== 1) {
      errors.push('Mark exactly one primary contact.')
    }
    for (const contact of contacts as Array<Record<string, unknown>>) {
      if (!clean(contact.name)) errors.push('Each contact needs a name.')
      if (!EMAIL_RE.test(clean(contact.email))) errors.push('Each contact needs a valid email.')
      if (!PHONE_RE.test(clean(contact.mobile).replace(/[\s-]/g, ''))) errors.push('Each contact needs a valid mobile number.')
    }
  }
  if (step >= 2) {
    if (!clean(form.registered_address) || !clean(form.address_line) || !clean(form.city) || !clean(form.state)) {
      errors.push('Complete the registered address.')
    }
    if (!PIN_RE.test(clean(form.pin))) errors.push('Enter a valid PIN code.')
    if (!clean(form.gst_registration_type)) errors.push('GST registration type is required.')
    if (clean(form.gst_registration_type) !== 'Unregistered' && !GST_RE.test(clean(form.gst_number).toUpperCase())) {
      errors.push('Enter a valid GSTIN.')
    }
    const locations = Array.isArray(form.gst_locations) ? form.gst_locations : []
    for (const location of locations as Array<Record<string, unknown>>) {
      if (!clean(location.location_name) || !GST_RE.test(clean(location.gstin).toUpperCase()) || !PIN_RE.test(clean(location.pin))) {
        errors.push('Each GST location needs a name, PIN, and valid GSTIN.')
      }
    }
  }
  if (step >= 3) {
    if (!clean(form.bank_name) || !clean(form.account_holder_name) || !clean(form.branch) || !clean(form.account_type)) {
      errors.push('Complete bank details.')
    }
    if (!/^\d{9,18}$/.test(clean(form.account_number))) errors.push('Enter a valid account number.')
    if (!IFSC_RE.test(clean(form.ifsc).toUpperCase())) errors.push('Enter a valid IFSC code.')
    if (submit && !form.cancelled_cheque) errors.push('Cancelled cheque is required.')
  }
  if (step >= 4) {
    if (!PAN_RE.test(clean(form.pan).toUpperCase())) errors.push('Enter a valid PAN.')
    const aadhaar = clean(form.aadhaar_input).replace(/\D/g, '')
    if (aadhaar && !AADHAAR_RE.test(aadhaar)) errors.push('Enter a valid Aadhaar number.')
    if (submit && !aadhaar && !form.aadhaar_masked) errors.push('Aadhaar is required.')
    if (!clean(form.assessee_code) || !clean(form.company_registration)) errors.push('Complete company registration details.')
  }
  if (step >= 5 && submit) {
    if (form.msme && !clean(form.msme_number)) errors.push('MSME number is required.')
    if (form.iec_registered && !clean(form.iec_number)) errors.push('IEC number is required.')
    if (!form.declaration_accurate) errors.push('Declaration is required.')
  }
  return errors
}

export async function persistForm(
  service: SupabaseClient,
  vendor: Record<string, unknown>,
  form: Record<string, unknown>,
  currentStep: number,
) {
  const aadhaarDigits = clean(form.aadhaar_input).replace(/\D/g, '')
  const aadhaarPatch: Record<string, unknown> = {}
  if (aadhaarDigits && AADHAAR_RE.test(aadhaarDigits)) {
    aadhaarPatch.aadhaar_last4 = aadhaarDigits.slice(-4)
    aadhaarPatch.aadhaar_hash = await sha256Hex(aadhaarDigits)
    aadhaarPatch.adhar_card_number = null
  }

  const custom = (form.custom && typeof form.custom === 'object') ? form.custom : {}
  const { error } = await service.from('vendors').update({
    vendor_name: clip(clean(form.vendor_name), 120),
    legal_name: clip(clean(form.legal_name), 120) || null,
    vendor_type: clip(clean(form.vendor_type), 80) || null,
    vendor_phone_number: clean((form.contacts as Array<Record<string, unknown>> | undefined)?.find((item) => item.is_primary)?.mobile) || vendor.vendor_phone_number,
    registered_address: clip(clean(form.registered_address), 400) || null,
    address_line1: clip(clean(form.address_line), 200) || null,
    city: clip(clean(form.city), 80) || null,
    state: clip(clean(form.state), 80) || null,
    pincode: clip(clean(form.pin), 10) || null,
    country: clip(clean(form.country), 80) || 'India',
    gst_number: clip(clean(form.gst_number).toUpperCase(), 15) || null,
    gst_registration_type: clip(clean(form.gst_registration_type), 40) || null,
    bank_name: clip(clean(form.bank_name), 120) || null,
    vendor_name_as_per_bank: clip(clean(form.account_holder_name), 120) || null,
    vendor_account_number: clip(clean(form.account_number), 18) || null,
    vendor_bank_ifsc_code: clip(clean(form.ifsc).toUpperCase(), 11) || null,
    bank_branch: clip(clean(form.branch), 120) || null,
    vendor_account_type: clip(clean(form.account_type), 40) || null,
    pan_card_number: clip(clean(form.pan).toUpperCase(), 10) || null,
    tds_details: clip(clean(form.tds_details), 400) || null,
    assessee_code: clip(clean(form.assessee_code), 80) || null,
    company_no: clip(clean(form.company_registration), 120) || null,
    company_description: clip(clean(form.company_description), 500) || null,
    is_firm_msme: Boolean(form.msme),
    msme_number: clip(clean(form.msme_number), 80) || null,
    is_iec_registered: Boolean(form.iec_registered),
    ice_registration_number: clip(clean(form.iec_number), 80) || null,
    additional_information: clip(clean(form.additional_information), 1000) || null,
    declaration_accurate: Boolean(form.declaration_accurate),
    current_step: currentStep,
    last_accessed_at: new Date().toISOString(),
    dynamic_field_data: custom,
    form_data: { custom, saved_at: new Date().toISOString() },
    ...aadhaarPatch,
  }).eq('id', vendor.id)
  if (error) return error.message

  await service.from('vendor_contact_persons').delete().eq('vendor_id', vendor.id)
  const contacts = Array.isArray(form.contacts) ? form.contacts : []
  if (contacts.length) {
    const { error: contactError } = await service.from('vendor_contact_persons').insert(
      contacts.map((contact: Record<string, unknown>) => ({
        vendor_id: vendor.id,
        contact_person_name: clip(clean(contact.name), 120),
        contact_person_designation: clip(clean(contact.designation), 80) || null,
        contact_person_email: clip(clean(contact.email), 160) || null,
        contact_person_mobile: clip(clean(contact.mobile), 20) || null,
        alternate_phone: clip(clean(contact.alternate_phone), 20) || null,
        is_primary: Boolean(contact.is_primary),
      })),
    )
    if (contactError) return contactError.message
  }

  await service.from('vendor_gst_locations').delete().eq('vendor_id', vendor.id)
  const locations = Array.isArray(form.gst_locations) ? form.gst_locations : []
  if (locations.length) {
    const { error: gstError } = await service.from('vendor_gst_locations').insert(
      locations.map((location: Record<string, unknown>) => ({
        vendor_id: vendor.id,
        gst_location: clip(clean(location.location_name), 120),
        gst_address_line1: clip(clean(location.address), 200) || null,
        city: clip(clean(location.city), 80) || null,
        state: clip(clean(location.state), 80) || null,
        gst_pincode: clip(clean(location.pin), 10) || null,
        gst_number: clip(clean(location.gstin).toUpperCase(), 15) || null,
      })),
    )
    if (gstError) return gstError.message
  }
  return null
}

export async function handleUpload(service: SupabaseClient, vendor: Record<string, unknown>, kind: string, file: File) {
  if (!['cancelled_cheque', 'supporting_document'].includes(kind)) return json({ error: 'Unsupported document type.' }, 400)
  if (!ALLOWED_MIME.includes(file.type)) return json({ error: 'Allowed types: PDF, JPEG, PNG, WebP.' }, 400)
  if (file.size > MAX_FILE) return json({ error: 'File must be 10 MB or smaller.' }, 400)
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${vendor.id}/${crypto.randomUUID()}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  const uploaded = await service.storage.from('vendor-documents').upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  })
  if (uploaded.error) return json({ error: 'Could not store the document.' }, 500)
  if (kind === 'cancelled_cheque') {
    const { data: existing } = await service.from('vendor_documents').select('id, storage_path').eq('vendor_id', vendor.id).eq('document_type', 'cancelled_cheque')
    for (const row of existing ?? []) {
      await service.storage.from('vendor-documents').remove([row.storage_path])
      await service.from('vendor_documents').delete().eq('id', row.id)
    }
  }
  const { data: inserted, error } = await service.from('vendor_documents').insert({
    vendor_id: vendor.id,
    document_type: kind,
    bucket_name: 'vendor-documents',
    storage_path: path,
    original_filename: clip(file.name.replace(/[^\w.\- ]+/g, ''), 120) || `upload.${ext}`,
    mime_type: file.type,
    file_size: file.size,
  }).select('id, document_type, storage_path, original_filename, mime_type, file_size').single()
  if (error || !inserted) return json({ error: 'Could not record the document.' }, 500)
  const signed = await service.storage.from('vendor-documents').createSignedUrl(path, 60 * 10)
  return json({
    document: {
      id: inserted.id,
      kind: inserted.document_type,
      filename: inserted.original_filename,
      content_type: inserted.mime_type,
      size: inserted.file_size,
      path: inserted.storage_path,
      signed_url: signed.data?.signedUrl ?? null,
    },
  })
}

