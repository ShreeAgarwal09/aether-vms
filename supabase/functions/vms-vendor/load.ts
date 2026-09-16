import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const INVALID = 'Invalid or expired invitation.'
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const PHONE_RE = /^(?:\+91[-\s]?|0)?[6-9]\d{9}$/
export const PIN_RE = /^[1-9][0-9]{5}$/
export const GST_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/
export const AADHAAR_RE = /^[2-9][0-9]{11}$/
export const TOKEN_RE = /^[a-f0-9]{64}$/
export const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
export const MAX_FILE = 10 * 1024 * 1024
export const INVITE_WINDOW_MS = 10 * 60 * 1000
export const MAX_HITS = 40

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function invalid() {
  return json({ error: INVALID, code: 'invalid_invite' }, 404)
}

export function clean(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

export function clip(value: string, max = 200) {
  return value.slice(0, max)
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function clientIp(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown'
  return forwarded.split(',')[0].trim()
}

export async function rateLimit(service: SupabaseClient, req: Request, token: string) {
  const ipKey = `ip:${await sha256Hex(clientIp(req))}`
  const tokenKey = `tok:${await sha256Hex(token.slice(0, 16))}`
  for (const key of [ipKey, tokenKey]) {
    const { data } = await service.from('vendor_onboarding_throttle').select('key, hit_count, window_start').eq('key', key)
      .maybeSingle()
    const now = Date.now()
    if (!data) {
      await service.from('vendor_onboarding_throttle').insert({ key, hit_count: 1, window_start: new Date().toISOString() })
      continue
    }
    const start = new Date(data.window_start).getTime()
    if (now - start > INVITE_WINDOW_MS) {
      await service.from('vendor_onboarding_throttle').update({ hit_count: 1, window_start: new Date().toISOString() }).eq('key', key)
      continue
    }
    if (data.hit_count >= MAX_HITS) return false
    await service.from('vendor_onboarding_throttle').update({ hit_count: data.hit_count + 1 }).eq('key', key)
  }
  return true
}

export type SnapshotField = {
  id: string
  field_key: string
  label: string
  field_type: string
  placeholder: string | null
  help_text: string | null
  is_required: boolean
  options: Array<{ label: string; value: string }>
  validation_rules: Record<string, number | boolean | undefined>
  sort_order: number
}

export async function loadVendor(service: SupabaseClient, token: string) {
  if (!TOKEN_RE.test(token)) return null
  const hash = await sha256Hex(token)
  const { data } = await service.from('vendors').select('*').eq('invite_token_hash', hash).maybeSingle()
  return data
}

export function inviteUsable(vendor: Record<string, unknown>) {
  if (!vendor) return false
  if (vendor.status === 'blocked') return false
  if (vendor.invite_expires_at && new Date(String(vendor.invite_expires_at)).getTime() < Date.now()) return false
  return true
}

export async function ensureSnapshot(service: SupabaseClient, vendor: Record<string, unknown>) {
  if (vendor.form_snapshot) return vendor
  const { data: template } = await service
    .from('vendor_form_templates')
    .select('id, name, version')
    .eq('company_user_id', vendor.company_user_id)
    .eq('is_active', true)
    .maybeSingle()
  let fields: SnapshotField[] = []
  if (template) {
    const { data: rows } = await service
      .from('vendor_form_fields')
      .select('id, field_key, label, field_type, placeholder, help_text, is_required, options, validation_rules, sort_order')
      .eq('template_id', template.id)
      .order('sort_order')
    fields = (rows ?? []) as SnapshotField[]
  }
  const snapshot = {
    template_id: template?.id ?? null,
    template_name: template?.name ?? null,
    version: template?.version ?? null,
    captured_at: new Date().toISOString(),
    fields,
  }
  const patch = {
    form_snapshot: snapshot,
    template_id: template?.id ?? vendor.template_id ?? null,
    template_version: template?.version ?? null,
    onboarding_started_at: vendor.onboarding_started_at ?? new Date().toISOString(),
    last_accessed_at: new Date().toISOString(),
  }
  await service.from('vendors').update(patch).eq('id', vendor.id)
  return { ...vendor, ...patch }
}

export function snapshotFields(vendor: Record<string, unknown>): SnapshotField[] {
  const snapshot = vendor.form_snapshot as { fields?: SnapshotField[] } | null
  return Array.isArray(snapshot?.fields) ? snapshot.fields : []
}

export async function signedDocs(service: SupabaseClient, vendorId: string) {
  const { data } = await service
    .from('vendor_documents')
    .select('id, document_type, storage_path, original_filename, mime_type, file_size')
    .eq('vendor_id', vendorId)
  const docs = []
  for (const row of data ?? []) {
    const signed = await service.storage.from('vendor-documents').createSignedUrl(row.storage_path, 60 * 10)
    docs.push({
      id: row.id,
      kind: row.document_type,
      filename: row.original_filename,
      content_type: row.mime_type,
      size: row.file_size,
      path: row.storage_path,
      signed_url: signed.data?.signedUrl ?? null,
    })
  }
  return docs
}

export function asContacts(rows: Array<Record<string, unknown>>, fallbackEmail: string) {
  if (!rows.length) {
    return [{
      id: crypto.randomUUID(),
      name: '',
      designation: '',
      email: fallbackEmail,
      mobile: '',
      alternate_phone: '',
      is_primary: true,
    }]
  }
  return rows.map((row) => ({
    id: row.id,
    name: row.contact_person_name ?? '',
    designation: row.contact_person_designation ?? '',
    email: row.contact_person_email ?? '',
    mobile: row.contact_person_mobile ?? '',
    alternate_phone: row.alternate_phone ?? '',
    is_primary: Boolean(row.is_primary),
  }))
}

export async function publicPayload(service: SupabaseClient, vendor: Record<string, unknown>) {
  const { data: company } = await service.from('profiles').select('company_name').eq('id', vendor.company_user_id).maybeSingle()
  const { data: contacts } = await service.from('vendor_contact_persons').select('*').eq('vendor_id', vendor.id)
  const { data: gstRows } = await service.from('vendor_gst_locations').select('*').eq('vendor_id', vendor.id)
  const docs = await signedDocs(service, String(vendor.id))
  const cheque = docs.find((item) => item.kind === 'cancelled_cheque') ?? null
  const supporting = docs.filter((item) => item.kind !== 'cancelled_cheque')
  const snapshot = vendor.form_snapshot as { template_name?: string; version?: number; fields?: SnapshotField[] } | null
  const custom = (vendor.dynamic_field_data as Record<string, string | boolean | number | null>) ?? {}
  const submitted = vendor.status === 'pending' || vendor.status === 'approved'
  return {
    status: vendor.status,
    submitted,
    rejection_reason: vendor.status === 'rejected' ? vendor.rejection_reason ?? null : null,
    company_name: company?.company_name || 'the inviting company',
    vendor_email: vendor.email,
    current_step: vendor.current_step ?? 1,
    expires_at: vendor.invite_expires_at,
    template_name: snapshot?.template_name ?? null,
    template_version: snapshot?.version ?? vendor.template_version ?? null,
    fields: snapshotFields(vendor),
    form: {
      vendor_name: vendor.vendor_name ?? '',
      legal_name: vendor.legal_name ?? '',
      vendor_type: vendor.vendor_type ?? '',
      contacts: asContacts(contacts ?? [], String(vendor.email ?? '')),
      registered_address: vendor.registered_address ?? '',
      address_line: vendor.address_line1 ?? '',
      city: vendor.city ?? '',
      state: vendor.state ?? '',
      pin: vendor.pincode ?? '',
      country: vendor.country ?? 'India',
      gst_number: vendor.gst_number ?? '',
      gst_registration_type: vendor.gst_registration_type ?? '',
      gst_locations: (gstRows ?? []).map((row: Record<string, unknown>) => ({
        id: row.id,
        location_name: row.gst_location ?? '',
        address: row.gst_address_line1 ?? '',
        city: row.city ?? '',
        state: row.state ?? '',
        pin: row.gst_pincode ?? '',
        gstin: row.gst_number ?? '',
      })),
      bank_name: vendor.bank_name ?? '',
      account_holder_name: vendor.vendor_name_as_per_bank ?? '',
      account_number: vendor.vendor_account_number ?? '',
      ifsc: vendor.vendor_bank_ifsc_code ?? '',
      branch: vendor.bank_branch ?? '',
      account_type: vendor.vendor_account_type ?? '',
      cancelled_cheque: cheque,
      pan: vendor.pan_card_number ?? '',
      aadhaar_input: '',
      aadhaar_masked: vendor.aadhaar_last4 ? `XXXX-XXXX-${vendor.aadhaar_last4}` : null,
      tds_details: vendor.tds_details ?? '',
      assessee_code: vendor.assessee_code ?? '',
      company_registration: vendor.company_no ?? '',
      company_description: vendor.company_description ?? '',
      msme: Boolean(vendor.is_firm_msme),
      msme_number: vendor.msme_number ?? '',
      iec_registered: Boolean(vendor.is_iec_registered),
      iec_number: vendor.ice_registration_number ?? '',
      declaration_accurate: Boolean(vendor.declaration_accurate),
      additional_information: vendor.additional_information ?? '',
      supporting_docs: supporting,
      custom,
    },
  }
}

