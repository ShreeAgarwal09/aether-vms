export type AppRole = 'admin' | 'company'

export type Profile = {
  id: string
  email: string
  full_name: string | null
  company_name: string | null
  company_mobile_number: string | null
  company_address: string | null
  gst_number: string | null
  role: AppRole
  is_active: boolean
  created_at: string
  updated_at?: string
}

export type CompanyUser = Profile

export type VendorStatus = 'invited' | 'pending' | 'approved' | 'rejected' | 'blocked'

export type Vendor = {
  id: string
  vendor_name: string | null
  email: string
  vendor_phone_number: string | null
  status: VendorStatus
  invited_at: string | null
  submitted_at?: string | null
  rejection_reason?: string | null
  approved_at?: string | null
  rejected_at?: string | null
  resubmitted_at?: string | null
  bc_sync_status?: string | null
  created_at: string
  updated_at?: string
}
