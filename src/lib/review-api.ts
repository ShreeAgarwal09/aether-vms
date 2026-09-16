import { getSupabase } from '@/lib/supabase'
import { MESSAGES, userFacingError } from '@/lib/errors'
import type { VendorStatus } from '@/lib/types'

export type ReviewField = {
  key: string
  label: string
  type: string
  required: boolean
  value: string
}

export type ReviewDocument = {
  id: string
  document_type: string
  original_filename: string
  mime_type: string
  file_size: number
  created_at?: string
}

export type ReviewHistoryItem = {
  id: string
  action: 'submitted' | 'approved' | 'rejected' | 'resubmitted'
  reason: string | null
  created_at: string
  reviewer?: string | null
}

export type VendorReview = {
  id: string
  status: VendorStatus
  submitted_at: string | null
  invited_at: string | null
  approved_at: string | null
  rejected_at: string | null
  resubmitted_at: string | null
  rejection_reason: string | null
  template_name: string | null
  template_version: number | null
  basic: {
    vendor_name: string | null
    legal_name: string | null
    vendor_type: string | null
    email: string
    phone: string | null
  }
  contacts: Array<{
    name: string | null
    designation: string | null
    email: string | null
    mobile: string | null
    is_primary: boolean
  }>
  address: {
    registered_address: string | null
    address_line: string | null
    city: string | null
    state: string | null
    pin: string | null
    country: string | null
    gst_number: string | null
    gst_registration_type: string | null
  }
  gst_locations: Array<{
    location_name: string | null
    address: string | null
    city: string | null
    state: string | null
    pin: string | null
    gstin: string | null
  }>
  bank: {
    bank_name: string | null
    branch: string | null
    account_holder: string | null
    account_number_masked: string | null
    account_number?: string | null
    ifsc: string | null
    account_type: string | null
  }
  company: {
    pan: string | null
    aadhaar: string
    tds_details: string | null
    assessee_code: string | null
    company_registration: string | null
    company_description: string | null
  }
  other: {
    msme: string
    iec: string
    declaration_accurate: string
    additional_information: string | null
  }
  custom_fields: ReviewField[]
  documents: ReviewDocument[]
  history: ReviewHistoryItem[]
  integration?: {
    bc_sync_status: string
    bc_vendor_id: string | null
    bc_vendor_number: string | null
    bc_last_synced_at: string | null
    bc_last_error: string | null
    bc_contact_sync_status: string
    bc_gst_sync_status: string
    bc_bank_sync_status: string
    bc_document_sync_status: string
    tally_sync_status: string
    tally_last_synced_at: string | null
    tally_last_error: string | null
  }
}

type FunctionResponse = {
  error?: string
  message?: string
  emailNote?: string
  status?: VendorStatus
  success?: boolean
  review?: VendorReview
  url?: string
  filename?: string
  expires_in?: number
}

async function invokeCompany(body: Record<string, unknown>): Promise<FunctionResponse> {
  const { data, error } = await getSupabase().functions.invoke<FunctionResponse>('vms-company', { body })
  if (error) {
    const response = (error as { context?: Response }).context
    if (response && typeof response.json === 'function') {
      try {
        const parsed = (await response.json()) as FunctionResponse
        if (parsed.error) parsed.error = userFacingError(parsed.error, MESSAGES.generic)
        return parsed
      } catch {
        return { error: userFacingError(error.message, MESSAGES.generic) }
      }
    }
    return { error: userFacingError(error.message, MESSAGES.generic) }
  }
  if (data?.error) data.error = userFacingError(data.error, MESSAGES.generic)
  return data ?? {}
}

export async function fetchVendorReview(vendorId: string, revealAccount = false) {
  return invokeCompany({ action: 'get_vendor_review', vendorId, revealAccount })
}

export async function reviewVendor(vendorId: string, decision: 'approve' | 'reject', reason?: string) {
  return invokeCompany({ action: 'review_vendor', vendorId, decision, reason })
}

export async function signVendorDocument(vendorId: string, documentId: string) {
  return invokeCompany({ action: 'sign_vendor_document', vendorId, documentId })
}

export function displayOrEmpty(value: string | null | undefined) {
  if (value === undefined || value === null || String(value).trim() === '') return 'Not provided'
  return String(value)
}
