import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function clean(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

export function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return null
  return createClient(url, key)
}

export async function requireCompany(req: Request, service: SupabaseClient) {
  const auth = req.headers.get('Authorization')
  if (!auth) return { error: json({ error: 'Authorization required.' }, 401) }
  const token = auth.replace(/^Bearer\s+/i, '')
  const { data: { user }, error } = await service.auth.getUser(token)
  if (error || !user) return { error: json({ error: 'Invalid session.' }, 401) }
  const { data: caller } = await service
    .from('profiles')
    .select('id, role, is_active, company_name, email')
    .eq('id', user.id)
    .maybeSingle()
  if (!caller || caller.role !== 'company' || !caller.is_active) {
    return { error: json({ error: 'Active company access required.' }, 403) }
  }
  return { caller }
}

export function sanitizeExternalError(text: string, status?: number) {
  const raw = text.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, '[redacted]').slice(0, 400)
  if (status === 401) return { code: 'expired_token', message: 'Business Central rejected the access token. Reconnect if refresh failed.' }
  if (status === 403) return { code: 'permission_denied', message: 'Business Central denied this operation. Check Entra API permissions.' }
  if (status === 404) return { code: 'company_not_found', message: 'Business Central resource or company was not found.' }
  if (/invalid_client/i.test(raw)) return { code: 'invalid_client', message: 'Microsoft rejected the application credentials.' }
  if (/consent/i.test(raw)) return { code: 'consent_denied', message: 'Microsoft Entra consent was denied.' }
  if (/AADSTS700016|tenant/i.test(raw)) return { code: 'invalid_tenant', message: 'The Microsoft tenant ID is invalid or the app is not available in that tenant.' }
  if (/environment/i.test(raw) && status === 404) return { code: 'invalid_environment', message: 'The Business Central environment name was not found.' }
  return { code: 'api_unavailable', message: 'Unable to connect to Business Central. Please check the integration configuration.' }
}

export async function logSync(
  service: SupabaseClient,
  row: {
    company_user_id: string
    vendor_id?: string | null
    integration_type: 'business_central' | 'tally'
    operation: string
    status: string
    external_id?: string | null
    error_code?: string | null
    error_message?: string | null
    metadata_safe_json?: Record<string, unknown>
  },
) {
  await service.from('integration_sync_logs').insert({
    company_user_id: row.company_user_id,
    vendor_id: row.vendor_id ?? null,
    integration_type: row.integration_type,
    operation: row.operation,
    status: row.status,
    external_id: row.external_id ?? null,
    error_code: row.error_code ?? null,
    error_message: row.error_message ?? null,
    metadata_safe_json: row.metadata_safe_json ?? {},
  })
}

async function importKey(secret: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptSecret(plain: string) {
  const secret = Deno.env.get('BC_TOKEN_ENCRYPTION_KEY') || Deno.env.get('BC_CLIENT_SECRET')
  if (!secret) throw new Error('Token encryption key is not configured.')
  const key = await importKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain))
  const packed = new Uint8Array(iv.length + cipher.byteLength)
  packed.set(iv)
  packed.set(new Uint8Array(cipher), iv.length)
  return btoa(String.fromCharCode(...packed))
}

export async function decryptSecret(packedB64: string) {
  const secret = Deno.env.get('BC_TOKEN_ENCRYPTION_KEY') || Deno.env.get('BC_CLIENT_SECRET')
  if (!secret) throw new Error('Token encryption key is not configured.')
  const key = await importKey(secret)
  const packed = Uint8Array.from(atob(packedB64), (c) => c.charCodeAt(0))
  const iv = packed.slice(0, 12)
  const data = packed.slice(12)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(plain)
}

export function randomHex(bytes = 32) {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  const bytes = new Uint8Array(digest)
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export const DEFAULT_MAPPINGS = [
  { vms: 'vendor_name', bc: 'displayName', supported: true },
  { vms: 'legal_name', bc: 'displayName', supported: true, note: 'Used when vendor_name is empty.' },
  { vms: 'email', bc: 'email', supported: true },
  { vms: 'phone', bc: 'phoneNumber', supported: true },
  { vms: 'address', bc: 'addressLine1', supported: true },
  { vms: 'city', bc: 'city', supported: true },
  { vms: 'state', bc: 'state', supported: true },
  { vms: 'postal_code', bc: 'postalCode', supported: true },
  { vms: 'country', bc: 'country', supported: true },
  { vms: 'gst', bc: 'taxRegistrationNumber', supported: true, note: 'Primary GSTIN only.' },
  { vms: 'payment_terms', bc: 'paymentTermsId', supported: true, note: 'Requires a paymentTerms GUID from master data.' },
  { vms: 'pan', bc: null, supported: false, note: 'Not available on standard vendor resource. Custom API required.' },
  { vms: 'bank_details', bc: null, supported: false, note: 'Vendor bank accounts are not a standard v2.0 vendor child. Company bankAccounts is a different entity.' },
  { vms: 'contact_persons', bc: 'contacts', supported: true, note: 'Created as Contact (Person). Vendor-link via contactsInformation is best-effort.' },
  { vms: 'gst_locations', bc: null, supported: false, note: 'No standard GST location collection on vendor.' },
  { vms: 'documents', bc: 'documentAttachments', supported: true, note: 'Posted to vendors({id})/documentAttachments when the API accepts parent vendor.' },
]
