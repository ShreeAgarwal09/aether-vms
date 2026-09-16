import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { bcFetch, companyUrl, connectionContext } from './bc-api.ts'
import { DEFAULT_MAPPINGS, json, logSync, sanitizeExternalError } from './shared.ts'

type Mapping = { vms: string; bc: string | null; supported: boolean }

function applyMappings(vendor: Record<string, unknown>, mappings: Mapping[]) {
  const payload: Record<string, unknown> = {}
  const unsupported: string[] = []
  const valueFor = (key: string) => {
    if (key === 'vendor_name') return vendor.vendor_name || vendor.legal_name
    if (key === 'legal_name') return vendor.legal_name
    if (key === 'email') return vendor.email
    if (key === 'phone') return vendor.vendor_phone_number
    if (key === 'address') return vendor.registered_address || vendor.address_line1
    if (key === 'city') return vendor.city
    if (key === 'state') return vendor.state
    if (key === 'postal_code') return vendor.pincode
    if (key === 'country') return vendor.country || 'IN'
    if (key === 'gst') return vendor.gst_number
    return null
  }
  for (const map of mappings) {
    if (!map.supported || !map.bc) {
      if (['pan', 'bank_details', 'gst_locations'].includes(map.vms)) unsupported.push(map.vms)
      continue
    }
    if (map.bc === 'contacts' || map.bc === 'documentAttachments' || map.bc === 'paymentTermsId') continue
    const value = valueFor(map.vms)
    if (value) payload[map.bc] = value
  }
  if (!payload.displayName) payload.displayName = vendor.vendor_name || vendor.email
  return { payload, unsupported }
}

async function loadMappings(service: SupabaseClient, callerId: string): Promise<Mapping[]> {
  const { data } = await service
    .from('business_central_vendor_templates')
    .select('field_mappings')
    .eq('company_user_id', callerId)
    .eq('is_active', true)
    .maybeSingle()
  const rows = Array.isArray(data?.field_mappings) ? data.field_mappings as Mapping[] : DEFAULT_MAPPINGS
  return rows
}

export async function validateVendor(service: SupabaseClient, callerId: string, vendorId: string) {
  const ctx = await connectionContext(service, callerId)
  if ('error' in ctx) return json({ error: ctx.error.message, code: ctx.error.code, configured: Boolean(Deno.env.get('BC_CLIENT_ID')) }, 400)
  if (!ctx.conn.bc_company_id) return json({ error: 'Select a Business Central company before validating.', code: 'company_not_found' }, 400)
  const { data: vendor } = await service.from('vendors').select('*').eq('id', vendorId).maybeSingle()
  if (!vendor || vendor.company_user_id !== callerId) return json({ error: 'Vendor not found.' }, 404)
  const errors: string[] = []
  if (!vendor.vendor_name) errors.push('Vendor name is required for Business Central displayName.')
  if (!vendor.email) errors.push('Email is required.')
  const warnings = [
    'PAN has no standard vendor field.',
    'Vendor bank account/IFSC has no standard vendor child resource.',
    'Additional GST locations have no standard collection.',
  ]
  await logSync(service, {
    company_user_id: callerId,
    vendor_id: vendorId,
    integration_type: 'business_central',
    operation: 'validate_vendor',
    status: errors.length ? 'failed' : 'success',
    error_message: errors[0] ?? null,
    metadata_safe_json: { warnings },
  })
  if (errors.length) return json({ valid: false, error: errors[0], details: errors, warnings }, 400)
  return json({ valid: true, warnings, message: 'Vendor can be posted to the standard vendors API.' })
}

async function postVendor(token: string, root: string, companyId: string, payload: Record<string, unknown>, existingId: string | null) {
  if (existingId) {
    const { response, body } = await bcFetch(token, companyUrl(root, companyId, `/vendors(${existingId})`))
    if (response.ok) return { ok: true, vendor: body as Record<string, unknown>, created: false }
  }
  const { response, body } = await bcFetch(token, companyUrl(root, companyId, '/vendors'), {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    return { ok: false, error: sanitizeExternalError(JSON.stringify(body).slice(0, 300), response.status) }
  }
  return { ok: true, vendor: body as Record<string, unknown>, created: true }
}

async function syncContacts(
  token: string,
  root: string,
  companyId: string,
  contacts: Array<Record<string, unknown>>,
) {
  const results: Array<{ name: string; status: string; id?: string; error?: string }> = []
  for (const contact of contacts) {
    const payload = {
      displayName: contact.contact_person_name,
      type: 'Person',
      email: contact.contact_person_email,
      phoneNumber: contact.contact_person_mobile,
      mobilePhoneNumber: contact.contact_person_mobile,
    }
    const { response, body } = await bcFetch(token, companyUrl(root, companyId, '/contacts'), {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      results.push({
        name: String(contact.contact_person_name || ''),
        status: 'failed',
        error: sanitizeExternalError(JSON.stringify(body).slice(0, 200), response.status).message,
      })
    } else {
      results.push({ name: String(contact.contact_person_name || ''), status: 'synced', id: String((body as { id?: string }).id || '') })
    }
  }
  return results
}

async function syncDocuments(
  service: SupabaseClient,
  token: string,
  root: string,
  companyId: string,
  bcVendorId: string,
  docs: Array<Record<string, unknown>>,
) {
  const results: Array<{ filename: string; status: string; error?: string }> = []
  for (const doc of docs) {
    const path = String(doc.storage_path || '')
    const filename = String(doc.original_filename || 'document')
    if (!path) {
      results.push({ filename, status: 'failed', error: 'Missing storage path.' })
      continue
    }
    const downloaded = await service.storage.from('vendor-documents').download(path)
    if (downloaded.error || !downloaded.data) {
      results.push({ filename, status: 'failed', error: 'Could not read the private document.' })
      continue
    }
    const bytes = new Uint8Array(await downloaded.data.arrayBuffer())
    let binary = ''
    bytes.forEach((b) => {
      binary += String.fromCharCode(b)
    })
    const { response, body } = await bcFetch(
      token,
      companyUrl(root, companyId, `/vendors(${bcVendorId})/documentAttachments`),
      {
        method: 'POST',
        body: JSON.stringify({
          fileName: filename,
          parentId: bcVendorId,
          attachmentContent: btoa(binary),
        }),
      },
    )
    if (!response.ok) {
      results.push({
        filename,
        status: 'unsupported',
        error: 'Standard documentAttachments POST was not accepted for this vendor. File remains in private VMS storage. A BC extension may be required.',
      })
    } else {
      results.push({ filename, status: 'synced' })
    }
    void body
  }
  return results
}

export async function syncVendorToBc(
  service: SupabaseClient,
  callerId: string,
  vendorId: string,
  approveLocal: boolean,
) {
  const cfgMissing = !Deno.env.get('BC_CLIENT_ID') || !Deno.env.get('BC_CLIENT_SECRET') || !Deno.env.get('BC_REDIRECT_URI')
  if (cfgMissing) {
    return json({
      error: 'Unable to connect to Business Central. Please check the integration configuration.',
      code: 'oauth_failed',
      configured: false,
    }, 503)
  }
  const { data: vendor } = await service.from('vendors').select('*').eq('id', vendorId).maybeSingle()
  if (!vendor || vendor.company_user_id !== callerId) return json({ error: 'Vendor not found.' }, 404)
  if (vendor.status !== 'pending' && vendor.status !== 'approved') {
    return json({ error: 'Only pending or approved vendors can sync to Business Central.' }, 409)
  }
  if (!vendor.submitted_at) {
    return json({ error: 'This vendor has not submitted onboarding.', code: 'validation_failed' }, 400)
  }
  if (!vendor.vendor_name) {
    return json({ error: 'Vendor validation failed. Please review the highlighted fields.', code: 'validation_failed' }, 400)
  }

  await service.from('vendors').update({
    bc_sync_status: vendor.bc_vendor_id ? 'creating' : 'validating',
    bc_sync_attempts: (vendor.bc_sync_attempts || 0) + 1,
  }).eq('id', vendor.id)

  const ctx = await connectionContext(service, callerId)
  if ('error' in ctx) {
    await service.from('vendors').update({ bc_sync_status: 'failed', bc_last_error: ctx.error.message }).eq('id', vendor.id)
    await logSync(service, {
      company_user_id: callerId,
      vendor_id: vendor.id,
      integration_type: 'business_central',
      operation: 'sync_vendor',
      status: 'failed',
      error_code: ctx.error.code,
      error_message: ctx.error.message,
    })
    return json({ error: ctx.error.message, code: ctx.error.code }, 400)
  }
  if (!ctx.conn.bc_company_id) {
    await service.from('vendors').update({ bc_sync_status: 'failed', bc_last_error: 'No BC company selected.' }).eq('id', vendor.id)
    return json({ error: 'Select a Business Central company first.', code: 'company_not_found' }, 400)
  }

  const mappings = await loadMappings(service, callerId)
  const { payload, unsupported } = applyMappings(vendor, mappings)
  const posted = await postVendor(ctx.token, ctx.root, ctx.conn.bc_company_id, payload, vendor.bc_vendor_id)
  if (!posted.ok || !posted.vendor) {
    const err = posted.error || { code: 'vendor_creation_failed', message: 'Vendor creation failed.' }
    await service.from('vendors').update({ bc_sync_status: 'failed', bc_last_error: err.message }).eq('id', vendor.id)
    await logSync(service, {
      company_user_id: callerId,
      vendor_id: vendor.id,
      integration_type: 'business_central',
      operation: 'create_vendor',
      status: 'failed',
      error_code: err.code,
      error_message: err.message,
    })
    return json({ error: err.message, code: err.code }, 400)
  }

  const bcId = String(posted.vendor.id || vendor.bc_vendor_id)
  const bcNumber = String(posted.vendor.number || vendor.bc_vendor_number || '')
  await service.from('vendors').update({
    bc_vendor_id: bcId,
    bc_vendor_number: bcNumber || null,
    bc_sync_status: 'creating',
    bc_gst_sync_status: 'not_supported',
    bc_bank_sync_status: 'not_supported',
  }).eq('id', vendor.id)

  const { data: contacts } = await service.from('vendor_contact_persons').select('*').eq('vendor_id', vendor.id)
  const contactResults = contacts?.length
    ? await syncContacts(ctx.token, ctx.root, ctx.conn.bc_company_id, contacts)
    : []
  const contactFailed = contactResults.some((row) => row.status === 'failed')
  const contactStatus = !contactResults.length ? 'synced' : contactFailed ? 'partial' : 'synced'

  const { data: docs } = await service.from('vendor_documents').select('id, storage_path, original_filename, document_type').eq('vendor_id', vendor.id)
  const docResults = docs?.length
    ? await syncDocuments(service, ctx.token, ctx.root, ctx.conn.bc_company_id, bcId, docs)
    : []
  const docUnsupported = docResults.some((row) => row.status === 'unsupported' || row.status === 'failed')
  const docStatus = !docResults.length ? 'synced' : docUnsupported ? 'partial' : 'synced'

  const { data: gstRows } = await service.from('vendor_gst_locations').select('id').eq('vendor_id', vendor.id)
  const gstStatus = gstRows?.length ? 'not_supported' : 'synced'

  const overall = contactFailed || docUnsupported || gstStatus === 'not_supported' ? 'partial' : 'synced'
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    bc_sync_status: overall,
    bc_contact_sync_status: contactStatus,
    bc_document_sync_status: docStatus,
    bc_gst_sync_status: gstStatus,
    bc_bank_sync_status: 'not_supported',
    bc_last_synced_at: now,
    bc_last_error: overall === 'synced' ? null : 'Some child records are unsupported or failed. Vendor header was saved. Retry will not create a second vendor.',
  }
  if (approveLocal && vendor.status === 'pending') {
    patch.status = 'approved'
    patch.approved_at = now
    patch.approved_by = callerId
  }
  await service.from('vendors').update(patch).eq('id', vendor.id)
  if (approveLocal && vendor.status === 'pending') {
    await service.from('vendor_review_history').insert({
      vendor_id: vendor.id,
      company_user_id: callerId,
      action: 'approved',
      reason: 'Approved with Business Central sync.',
    })
  }
  await logSync(service, {
    company_user_id: callerId,
    vendor_id: vendor.id,
    integration_type: 'business_central',
    operation: posted.created ? 'create_vendor' : 'retry_sync',
    status: overall === 'synced' ? 'success' : 'partial',
    external_id: bcId,
    metadata_safe_json: {
      bc_vendor_number: bcNumber,
      contacts: contactResults.map((row) => ({ name: row.name, status: row.status })),
      documents: docResults.map((row) => ({ filename: row.filename, status: row.status })),
      unsupported,
      gst_locations: gstStatus,
      bank: 'not_supported',
    },
  })
  return json({
    success: true,
    status: overall,
    bc_vendor_id: bcId,
    bc_vendor_number: bcNumber,
    contacts: contactResults,
    documents: docResults,
    gst: gstStatus,
    bank: 'not_supported',
    message: overall === 'synced'
      ? 'Vendor created in Business Central.'
      : 'Vendor header was created in Business Central. Some child data is unsupported or failed.',
  })
}
