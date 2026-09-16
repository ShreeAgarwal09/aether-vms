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
