import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { appBase, json } from './invite.ts'

type SnapshotField = {
  field_key: string
  label: string
  field_type: string
  options?: Array<{ label: string; value: string }>
  is_required?: boolean
}

const GST_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/
const PIN_RE = /^[1-9][0-9]{5}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_REASON = 1000
const MIN_REASON = 8
const DOC_TTL_SECONDS = 120

export function maskAccount(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return null
  const last = digits.slice(-4)
  return `${'X'.repeat(Math.max(6, digits.length - 4))}${last}`
}

function displayValue(value: unknown) {
  if (value === undefined || value === null || value === '') return 'Not provided'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) {
    const items = value.map((item) => String(item).trim()).filter(Boolean)
    return items.length ? items.join(', ') : 'Not provided'
  }
  return String(value)
}

function formatCustom(fields: SnapshotField[], custom: Record<string, unknown>) {
  return fields.map((field) => {
    const raw = custom[field.field_key]
    let formatted = displayValue(raw)
    if (field.field_type === 'checkbox') {
      if (Array.isArray(raw)) {
        const labels = (field.options ?? []).filter((option) => raw.includes(option.value)).map((option) => option.label)
        formatted = labels.length ? labels.join(', ') : displayValue(raw)
      } else if (raw === true) formatted = 'Yes'
      else if (raw === false) formatted = 'No'
      else formatted = 'Not provided'
    }
    if ((field.field_type === 'dropdown' || field.field_type === 'radio') && typeof raw === 'string') {
      formatted = field.options?.find((option) => option.value === raw)?.label ?? raw
    }
    if (field.field_type === 'datetime' && typeof raw === 'string' && raw) {
      const parsed = new Date(raw)
      formatted = Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString('en-IN')
    }
    return {
      key: field.field_key,
      label: field.label,
      type: field.field_type,
      required: Boolean(field.is_required),
      value: formatted,
    }
  })
}

function snapshotFields(vendor: Record<string, unknown>): SnapshotField[] {
  const snapshot = vendor.form_snapshot as { fields?: SnapshotField[] } | null
  return Array.isArray(snapshot?.fields) ? snapshot.fields : []
}

export async function loadOwnedVendor(service: SupabaseClient, callerId: string, vendorId: string) {
  const { data } = await service.from('vendors').select('*').eq('id', vendorId).maybeSingle()
  if (!data || data.company_user_id !== callerId) return null
  return data as Record<string, unknown>
}

function submissionValid(vendor: Record<string, unknown>, contacts: unknown[], docs: unknown[]) {
  const errors: string[] = []
  if (!vendor.submitted_at) errors.push('This vendor has not submitted onboarding.')
  if (!String(vendor.vendor_name ?? '').trim()) errors.push('Vendor name is missing.')
  if (!PAN_RE.test(String(vendor.pan_card_number ?? '').toUpperCase())) errors.push('PAN is missing or invalid.')
  if (!/^\d{9,18}$/.test(String(vendor.vendor_account_number ?? ''))) errors.push('Bank account number is missing or invalid.')
  if (!IFSC_RE.test(String(vendor.vendor_bank_ifsc_code ?? '').toUpperCase())) errors.push('IFSC is missing or invalid.')
  if (!PIN_RE.test(String(vendor.pincode ?? ''))) errors.push('PIN code is missing or invalid.')
  if (String(vendor.gst_registration_type ?? '') !== 'Unregistered') {
    if (!GST_RE.test(String(vendor.gst_number ?? '').toUpperCase())) errors.push('GSTIN is missing or invalid.')
  }
  if (!contacts.length) errors.push('Contact persons are missing.')
  const cheque = (docs as Array<Record<string, unknown>>).some((row) => row.document_type === 'cancelled_cheque')
  if (!cheque) errors.push('Cancelled cheque is missing.')
  const fields = snapshotFields(vendor)
  const custom = (vendor.dynamic_field_data as Record<string, unknown>) ?? {}
  for (const field of fields) {
    if (!field.is_required) continue
    const value = custom[field.field_key]
    if (field.field_type === 'checkbox' && value !== true && !(Array.isArray(value) && value.length)) {
      errors.push(`${field.label} is required.`)
    } else if (value === undefined || value === null || String(value).trim() === '') {
      errors.push(`${field.label} is required.`)
    }
  }
  return errors
}

export async function handleGetReview(
  service: SupabaseClient,
  callerId: string,
  vendorId: string,
  revealAccount: boolean,
) {
  const vendor = await loadOwnedVendor(service, callerId, vendorId)
  if (!vendor) return json({ error: 'Vendor not found.' }, 404)

  const [{ data: contacts }, { data: gstRows }, { data: docs }, { data: history }] = await Promise.all([
    service.from('vendor_contact_persons').select(
      'id, contact_person_name, contact_person_designation, contact_person_email, contact_person_mobile, is_primary',
    ).eq('vendor_id', vendor.id),
    service.from('vendor_gst_locations').select(
      'id, gst_location, gst_address_line1, city, state, gst_pincode, gst_number',
    ).eq('vendor_id', vendor.id),
    service.from('vendor_documents').select(
      'id, document_type, original_filename, mime_type, file_size',
    ).eq('vendor_id', vendor.id),
    service.from('vendor_review_history').select('id, action, reason, created_at, company_user_id').eq('vendor_id', vendor.id).order('created_at', { ascending: false }),
  ])

  const reviewerIds = [...new Set((history ?? []).map((row: { company_user_id?: string | null }) => row.company_user_id).filter(Boolean))] as string[]
  const { data: reviewers } = reviewerIds.length
    ? await service.from('profiles').select('id, email, full_name').in('id', reviewerIds)
    : { data: [] as Array<{ id: string; email: string; full_name: string | null }> }
  const reviewerMap = new Map((reviewers ?? []).map((row) => [row.id, row.full_name || row.email]))
  const snapshot = vendor.form_snapshot as { template_name?: string; version?: number; fields?: SnapshotField[] } | null
  const custom = (vendor.dynamic_field_data as Record<string, unknown>) ?? {}
  const account = String(vendor.vendor_account_number ?? '')

  return json({
    review: {
      id: vendor.id,
      status: vendor.status,
      submitted_at: vendor.submitted_at,
      invited_at: vendor.invited_at,
      approved_at: vendor.approved_at,
      rejected_at: vendor.rejected_at,
      resubmitted_at: vendor.resubmitted_at,
      rejection_reason: vendor.rejection_reason,
      template_name: snapshot?.template_name ?? null,
      template_version: snapshot?.version ?? vendor.template_version ?? null,
      basic: {
        vendor_name: vendor.vendor_name,
        legal_name: vendor.legal_name,
        vendor_type: vendor.vendor_type,
        email: vendor.email,
        phone: vendor.vendor_phone_number,
      },
      contacts: (contacts ?? []).map((row: Record<string, unknown>) => ({
        name: row.contact_person_name,
        designation: row.contact_person_designation,
        email: row.contact_person_email,
        mobile: row.contact_person_mobile,
        is_primary: row.is_primary,
      })),
      address: {
        registered_address: vendor.registered_address,
        address_line: vendor.address_line1,
        city: vendor.city,
        state: vendor.state,
        pin: vendor.pincode,
        country: vendor.country,
        gst_number: vendor.gst_number,
        gst_registration_type: vendor.gst_registration_type,
      },
      gst_locations: (gstRows ?? []).map((row: Record<string, unknown>) => ({
        location_name: row.gst_location,
        address: row.gst_address_line1,
        city: row.city,
        state: row.state,
        pin: row.gst_pincode,
        gstin: row.gst_number,
      })),
      bank: {
        bank_name: vendor.bank_name,
        branch: vendor.bank_branch,
        account_holder: vendor.vendor_name_as_per_bank,
        account_number_masked: maskAccount(account),
        account_number: revealAccount ? account || null : undefined,
        ifsc: vendor.vendor_bank_ifsc_code,
        account_type: vendor.vendor_account_type,
      },
      company: {
        pan: vendor.pan_card_number,
        aadhaar: vendor.aadhaar_last4 ? `XXXX-XXXX-${vendor.aadhaar_last4}` : 'Not provided',
        tds_details: vendor.tds_details,
        assessee_code: vendor.assessee_code,
        company_registration: vendor.company_no,
        company_description: vendor.company_description,
      },
      other: {
        msme: vendor.is_firm_msme ? `Yes${vendor.msme_number ? ` · ${vendor.msme_number}` : ''}` : 'No',
        iec: vendor.is_iec_registered ? `Yes${vendor.ice_registration_number ? ` · ${vendor.ice_registration_number}` : ''}` : 'No',
        declaration_accurate: vendor.declaration_accurate ? 'Yes' : 'No',
        additional_information: vendor.additional_information,
      },
      custom_fields: formatCustom(snapshotFields(vendor), custom),
      documents: docs ?? [],
      history: (history ?? []).map((row: Record<string, unknown>) => ({
        id: row.id,
        action: row.action,
        reason: row.reason,
        created_at: row.created_at,
        reviewer: row.company_user_id ? reviewerMap.get(String(row.company_user_id)) ?? 'Company reviewer' : 'Vendor',
      })),
      integration: {
        bc_sync_status: vendor.bc_sync_status ?? 'not_started',
        bc_vendor_id: vendor.bc_vendor_id ?? null,
        bc_vendor_number: vendor.bc_vendor_number ?? null,
        bc_last_synced_at: vendor.bc_last_synced_at ?? null,
        bc_last_error: vendor.bc_last_error ?? null,
        bc_contact_sync_status: vendor.bc_contact_sync_status ?? 'not_started',
        bc_gst_sync_status: vendor.bc_gst_sync_status ?? 'not_started',
        bc_bank_sync_status: vendor.bc_bank_sync_status ?? 'not_started',
        bc_document_sync_status: vendor.bc_document_sync_status ?? 'not_started',
      },
    },
  })
}

export async function handleSignDocument(
  service: SupabaseClient,
  callerId: string,
  vendorId: string,
  documentId: string,
) {
  const vendor = await loadOwnedVendor(service, callerId, vendorId)
  if (!vendor) return json({ error: 'Vendor not found.' }, 404)
  const { data: doc } = await service
    .from('vendor_documents')
    .select('id, vendor_id, storage_path, original_filename, mime_type')
    .eq('id', documentId)
    .eq('vendor_id', vendorId)
    .maybeSingle()
  if (!doc) return json({ error: 'Document not found.' }, 404)
  const signed = await service.storage.from('vendor-documents').createSignedUrl(doc.storage_path, DOC_TTL_SECONDS)
  if (!signed.data?.signedUrl) return json({ error: 'Could not create a document link.' }, 500)
  return json({
    filename: doc.original_filename,
    content_type: doc.mime_type,
    expires_in: DOC_TTL_SECONDS,
    url: signed.data.signedUrl,
  })
}

async function sendRejectionEmail(options: {
  to: string
  companyName: string
  vendorName: string
  reason: string
  req: Request
}) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('EMAIL_FROM')
  if (!apiKey || !from) {
    return { sent: false, reason: 'Notification email is pending RESEND_API_KEY and EMAIL_FROM configuration.' }
  }
  const base = appBase(options.req)
  const html = `
    <p>Hello ${options.vendorName},</p>
    <p>${options.companyName} reviewed your vendor onboarding submission and needs corrections.</p>
    <p><strong>Reason:</strong> ${options.reason.replace(/[<>]/g, '')}</p>
    <p>Open the same secure onboarding link from your original invitation, update the requested information, and resubmit.</p>
    ${base ? `<p>If you no longer have that email, ask ${options.companyName} to resend the invitation from their vendor directory.</p>` : ''}
    <p>This message does not include bank details, PAN, Aadhaar, or other sensitive documents.</p>
  `
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [options.to],
      subject: `Vendor onboarding needs corrections — ${options.companyName}`,
      html,
    }),
  })
  if (!response.ok) {
    await response.text()
    return { sent: false, reason: 'Email provider rejected the notification.' }
  }
  return { sent: true as const, reason: null }
}

export async function handleReviewVendor(
  service: SupabaseClient,
  callerId: string,
  companyName: string,
  req: Request,
  vendorId: string,
  decision: string,
  reasonRaw: unknown,
) {
  const vendor = await loadOwnedVendor(service, callerId, vendorId)
  if (!vendor) return json({ error: 'Vendor not found.' }, 404)
  if (vendor.status !== 'pending') {
    return json({ error: 'Only pending submissions can be approved or rejected.' }, 409)
  }

  const { data: contacts } = await service.from('vendor_contact_persons').select('id, contact_person_email').eq('vendor_id', vendor.id)
  const { data: docs } = await service.from('vendor_documents').select('id, document_type').eq('vendor_id', vendor.id)

  if (decision === 'approve') {
    const errors = submissionValid(vendor, contacts ?? [], docs ?? [])
    if (errors.length) return json({ error: errors[0], details: errors }, 400)
    const now = new Date().toISOString()
    const { error } = await service.from('vendors').update({
      status: 'approved',
      approved_at: now,
      approved_by: callerId,
    }).eq('id', vendor.id).eq('company_user_id', callerId).eq('status', 'pending')
    if (error) return json({ error: 'Could not approve this vendor.' }, 400)
    await service.from('vendor_review_history').insert({
      vendor_id: vendor.id,
      company_user_id: callerId,
      action: 'approved',
      reason: null,
    })
    return json({ success: true, status: 'approved', message: `${vendor.vendor_name || 'Vendor'} is approved.` })
  }

  if (decision === 'reject') {
    const reason = typeof reasonRaw === 'string' ? reasonRaw.trim() : ''
    if (reason.length < MIN_REASON) {
      return json({ error: `Provide a rejection reason of at least ${MIN_REASON} characters.` }, 400)
    }
    if (reason.length > MAX_REASON) {
      return json({ error: `Rejection reason must be ${MAX_REASON} characters or fewer.` }, 400)
    }
    if (!EMAIL_RE.test(String(vendor.email ?? ''))) {
      return json({ error: 'Vendor email is missing.' }, 400)
    }
    const now = new Date().toISOString()
    const { error } = await service.from('vendors').update({
      status: 'rejected',
      rejected_at: now,
      rejected_by: callerId,
      rejection_reason: reason,
    }).eq('id', vendor.id).eq('company_user_id', callerId).eq('status', 'pending')
    if (error) return json({ error: 'Could not reject this vendor.' }, 400)
    await service.from('vendor_review_history').insert({
      vendor_id: vendor.id,
      company_user_id: callerId,
      action: 'rejected',
      reason,
    })
    const mail = await sendRejectionEmail({
      to: String(vendor.email),
      companyName,
      vendorName: String(vendor.vendor_name || 'Vendor'),
      reason,
      req,
    })
    return json({
      success: true,
      status: 'rejected',
      message: mail.sent
        ? `${vendor.vendor_name || 'Vendor'} was rejected and a notification email was queued.`
        : `${vendor.vendor_name || 'Vendor'} was rejected. ${mail.reason}`,
      emailQueued: mail.sent,
      emailNote: mail.reason,
    })
  }

  return json({ error: 'Invalid review action.' }, 400)
}
