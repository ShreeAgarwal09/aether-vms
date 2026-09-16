import { getSupabase } from '@/lib/supabase'
import type { Vendor, VendorStatus } from '@/lib/types'

export const VENDOR_LIST_COLUMNS =
  'id, vendor_name, email, vendor_phone_number, status, invited_at, created_at, updated_at'

export const PAGE_SIZE = 20

type FunctionResponse = {
  error?: string
  message?: string
  emailNote?: string
  results?: Array<{ email?: string; ok: boolean; error?: string; emailQueued?: boolean }>
  created?: number
  failed?: number
}

export type InviteResult = {
  error: string | null
  message?: string
  created?: number
  failed?: number
  results?: FunctionResponse['results']
}

async function invokeCompany(body: Record<string, unknown>): Promise<InviteResult> {
  const { data, error } = await getSupabase().functions.invoke<FunctionResponse>('vms-company', { body })
  if (error) {
    const response = (error as { context?: Response }).context
    if (response && typeof response.json === 'function') {
      try {
        const parsed = (await response.json()) as FunctionResponse
        return { error: parsed.error ?? error.message, message: parsed.message }
      } catch {
        return { error: error.message }
      }
    }
    return { error: error.message }
  }
  if (data?.error) return { error: data.error, message: data.message }
  return {
    error: null,
    message: data?.message,
    created: data?.created,
    failed: data?.failed,
    results: data?.results,
  }
}

export function fetchVendors(options: {
  query: string
  status: 'all' | VendorStatus
  page: number
}) {
  let request = getSupabase()
    .from('vendors')
    .select(VENDOR_LIST_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((options.page - 1) * PAGE_SIZE, options.page * PAGE_SIZE - 1)

  if (options.status !== 'all') {
    request = request.eq('status', options.status)
  }
  const needle = options.query.trim().replace(/[%(),]/g, '').slice(0, 80)
  if (needle) {
    request = request.or(
      `vendor_name.ilike.%${needle}%,email.ilike.%${needle}%,vendor_phone_number.ilike.%${needle}%`,
    )
  }
  return request
}

export function fetchVendor(id: string) {
  return getSupabase().from('vendors').select(VENDOR_LIST_COLUMNS).eq('id', id).maybeSingle()
}

export function fetchVendorStats() {
  return getSupabase().from('vendors').select('id, status, vendor_name, email, created_at, invited_at')
}

export function inviteVendor(values: { vendor_name: string; email: string; vendor_phone: string }) {
  return invokeCompany({ action: 'invite_vendor', vendor: values })
}

export function inviteVendorsBulk(
  vendors: Array<{ vendor_name: string; email: string; vendor_phone: string }>,
) {
  return invokeCompany({ action: 'invite_vendors_bulk', vendors })
}

export function resendVendorInvite(vendorId: string) {
  return invokeCompany({ action: 'resend_invite', vendorId })
}

export function fetchIpConfig() {
  return getSupabase()
    .from('ip_configs')
    .select('id, company_user_id, tally_host, tally_port, is_enabled, notes')
    .maybeSingle()
}

export function upsertIpConfig(values: {
  tally_host: string | null
  tally_port: number | null
  is_enabled: boolean
  notes: string | null
  company_user_id: string
}) {
  return getSupabase()
    .from('ip_configs')
    .upsert(
      {
        company_user_id: values.company_user_id,
        tally_host: values.tally_host,
        tally_port: values.tally_port,
        is_enabled: values.is_enabled,
        notes: values.notes,
      },
      { onConflict: 'company_user_id' },
    )
    .select('id, company_user_id, tally_host, tally_port, is_enabled, notes')
    .single()
}

export async function saveCompanyProfile(
  userId: string,
  values: {
    full_name: string
    company_name: string
    company_mobile_number: string | null
    company_address: string | null
    gst_number: string | null
  },
) {
  return getSupabase()
    .from('profiles')
    .update(values)
    .eq('id', userId)
    .eq('role', 'company')
    .select(
      'id, email, full_name, company_name, company_mobile_number, company_address, gst_number, role, is_active, created_at, updated_at',
    )
    .single()
}

export type ListedVendor = Pick<
  Vendor,
  'id' | 'vendor_name' | 'email' | 'vendor_phone_number' | 'status' | 'invited_at' | 'created_at' | 'updated_at'
>
