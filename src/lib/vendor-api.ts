import { userFacingError, MESSAGES } from '@/lib/errors'
import { getSupabase } from '@/lib/supabase'
import type { Vendor, VendorStatus } from '@/lib/types'

export const VENDOR_LIST_COLUMNS =
  'id, vendor_name, email, vendor_phone_number, status, invited_at, submitted_at, created_at, updated_at, rejection_reason, approved_at, rejected_at, resubmitted_at, bc_sync_status, tally_sync_status'

export const PAGE_SIZE = 20

type FunctionResponse = {
  error?: string
  message?: string
  emailNote?: string
  inviteLink?: string
  results?: Array<{ email?: string; ok: boolean; error?: string; emailQueued?: boolean; inviteLink?: string }>
  created?: number
  failed?: number
}

export type InviteResult = {
  error: string | null
  message?: string
  inviteLink?: string
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
        return {
          error: userFacingError(parsed.error ?? error.message, MESSAGES.generic),
          message: parsed.message,
        }
      } catch {
        return { error: userFacingError(error.message, MESSAGES.generic) }
      }
    }
    return { error: userFacingError(error.message, MESSAGES.generic) }
  }
  if (data?.error) return { error: userFacingError(data.error, MESSAGES.generic), message: data.message }
  return {
    error: null,
    message: data?.message,
    inviteLink: data?.inviteLink,
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
  | 'id'
  | 'vendor_name'
  | 'email'
  | 'vendor_phone_number'
  | 'status'
  | 'invited_at'
  | 'submitted_at'
  | 'created_at'
  | 'updated_at'
  | 'rejection_reason'
  | 'bc_sync_status'
  | 'tally_sync_status'
>
