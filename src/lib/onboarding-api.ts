import type { DocRef, OnboardingForm, SnapshotField } from '@/lib/onboarding'

const INVALID = 'Invalid or expired invitation.'

export type OnboardingPayload = {
  status: 'invited' | 'pending' | 'approved' | 'rejected' | 'blocked'
  submitted: boolean
  company_name: string
  vendor_email: string
  current_step: number
  expires_at: string | null
  form: OnboardingForm
  fields: SnapshotField[]
  template_name: string | null
  template_version: number | null
}

type FunctionResponse = {
  error?: string
  code?: string
  message?: string
  data?: OnboardingPayload
  document?: DocRef
  saveState?: 'saved'
}

function endpoint() {
  const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase is not configured.')
  return { url: `${url}/functions/v1/vms-vendor`, key }
}

async function parseResponse(response: Response): Promise<FunctionResponse> {
  const payload = (await response.json().catch(() => ({}))) as FunctionResponse
  if (!response.ok) {
    return { error: payload.error || INVALID, code: payload.code }
  }
  return payload
}

export async function vendorOnboard(body: Record<string, unknown>) {
  const { url, key } = endpoint()
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  })
  return parseResponse(response)
}

export async function uploadVendorDocument(token: string, kind: string, file: File) {
  const { url, key } = endpoint()
  const form = new FormData()
  form.set('action', 'upload_document')
  form.set('token', token)
  form.set('kind', kind)
  form.set('file', file)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: form,
  })
  return parseResponse(response)
}
