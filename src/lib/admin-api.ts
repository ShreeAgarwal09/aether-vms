import type { CompanyUser } from '@/lib/types'
import { getSupabase } from '@/lib/supabase'

export type CompanyFormValues = {
  full_name: string
  email: string
  company_name: string
  company_mobile_number: string
  company_address: string
  gst_number: string
}

export type AdminActionResult = {
  error: string | null
  message?: string
}

type FunctionResponse = {
  error?: string
  hint?: string
  message?: string
  userId?: string
}

async function invokeAdmin(body: Record<string, unknown>): Promise<AdminActionResult> {
  const supabase = getSupabase()
  const { data, error } = await supabase.functions.invoke<FunctionResponse>('vms-admin', { body })

  if (error) {
    const response = (error as { context?: Response }).context
    if (response && typeof response.json === 'function') {
      try {
        const parsed = (await response.json()) as FunctionResponse
        return {
          error: parsed.error ?? error.message,
          message: parsed.hint ?? parsed.message,
        }
      } catch {
        return { error: error.message }
      }
    }
    return { error: error.message }
  }

  if (data?.error) {
    return { error: data.error, message: data.hint ?? data.message }
  }

  return { error: null, message: data?.message }
}

export function fetchCompanyUsers() {
  return getSupabase()
    .from('profiles')
    .select(
      'id, email, full_name, company_name, company_mobile_number, company_address, gst_number, role, is_active, created_at, updated_at',
    )
    .eq('role', 'company')
    .order('created_at', { ascending: false })
}

export function updateCompanyProfile(userId: string, values: Omit<CompanyFormValues, 'email'>) {
  return getSupabase()
    .from('profiles')
    .update({
      full_name: values.full_name.trim(),
      company_name: values.company_name.trim(),
      company_mobile_number: values.company_mobile_number.trim() || null,
      company_address: values.company_address.trim() || null,
      gst_number: values.gst_number.trim().toUpperCase() || null,
    })
    .eq('id', userId)
    .eq('role', 'company')
    .select(
      'id, email, full_name, company_name, company_mobile_number, company_address, gst_number, role, is_active, created_at, updated_at',
    )
    .single()
}

export function createCompanyUser(values: CompanyFormValues) {
  return invokeAdmin({
    action: 'create_company_user',
    email: values.email,
    full_name: values.full_name,
    company_name: values.company_name,
    company_mobile_number: values.company_mobile_number,
    company_address: values.company_address,
    gst_number: values.gst_number,
  })
}

export function setCompanyActive(userId: string, isActive: boolean) {
  return invokeAdmin({
    action: 'set_company_active',
    userId,
    is_active: isActive,
  })
}

export function deleteCompanyUser(userId: string) {
  return invokeAdmin({
    action: 'delete_company_user',
    userId,
  })
}

export function sendCompanyPasswordEmail(userId: string) {
  return invokeAdmin({
    action: 'send_password_email',
    userId,
  })
}

export function emptyCompanyForm(): CompanyFormValues {
  return {
    full_name: '',
    email: '',
    company_name: '',
    company_mobile_number: '',
    company_address: '',
    gst_number: '',
  }
}

export function companyToForm(company: CompanyUser): CompanyFormValues {
  return {
    full_name: company.full_name ?? '',
    email: company.email,
    company_name: company.company_name ?? '',
    company_mobile_number: company.company_mobile_number ?? '',
    company_address: company.company_address ?? '',
    gst_number: company.gst_number ?? '',
  }
}
