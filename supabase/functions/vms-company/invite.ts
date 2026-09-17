import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendInviteEmail } from './email.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export type VendorInput = {
  vendor_name?: string
  email?: string
  vendor_phone?: string
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const INDIAN_PHONE_RE = /^(?:\+91[-\s]?|0)?[6-9]\d{9}$/

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function clean(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

export function normalizePhone(value: string) {
  return value.replace(/[\s-]/g, '')
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function newToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function appBase(req: Request) {
  return (Deno.env.get('APP_BASE_URL') || req.headers.get('origin') || '').replace(/\/$/, '')
}

function validateVendor(input: VendorInput) {
  const vendor_name = clean(input.vendor_name)
  const email = clean(input.email)?.toLowerCase()
  const phone = clean(input.vendor_phone)
  if (!vendor_name) return { error: 'Vendor name is required.' }
  if (!email || !EMAIL_RE.test(email)) return { error: 'A valid vendor email is required.' }
  if (!phone || !INDIAN_PHONE_RE.test(normalizePhone(phone))) {
    return { error: 'Enter a valid Indian mobile number.' }
  }
  return { vendor_name, email, vendor_phone: normalizePhone(phone) }
}

export { sendInviteEmail } from './email.ts'

export async function persistInvite(
  service: SupabaseClient,
  callerId: string,
  companyName: string,
  req: Request,
  input: VendorInput,
  existingId?: string,
) {
  const parsed = validateVendor(input)
  if ('error' in parsed && parsed.error) return { error: parsed.error }

  const vendor = parsed as { vendor_name: string; email: string; vendor_phone: string }
  const rawToken = newToken()
  const hash = await sha256Hex(rawToken)
  const invitedAt = new Date()
  const expires = new Date(invitedAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()

  if (existingId) {
    const { data: existing } = await service
      .from('vendors')
      .select('id, company_user_id, status')
      .eq('id', existingId)
      .maybeSingle()
    if (!existing || existing.company_user_id !== callerId) {
      return { error: 'Vendor not found.' }
    }
    if (existing.status === 'pending' || existing.status === 'approved') {
      return { error: 'This vendor has already submitted onboarding.' }
    }
    if (existing.status === 'blocked') {
      return { error: 'This vendor is blocked.' }
    }
    const { error } = await service
      .from('vendors')
      .update({
        vendor_name: vendor.vendor_name,
        vendor_phone_number: vendor.vendor_phone,
        invite_token_hash: hash,
        invited_at: invitedAt.toISOString(),
        invite_expires_at: expires,
        invite_consumed_at: null,
        status: existing.status === 'rejected' ? 'rejected' : 'invited',
      })
      .eq('id', existingId)
      .eq('company_user_id', callerId)
    if (error) return { error: 'Could not update the invitation.' }
  } else {
    const { error } = await service.from('vendors').insert({
      company_user_id: callerId,
      vendor_name: vendor.vendor_name,
      email: vendor.email,
      vendor_phone_number: vendor.vendor_phone,
      status: 'invited',
      invite_token_hash: hash,
      invited_at: invitedAt.toISOString(),
      invite_expires_at: expires,
    })
    if (error) {
      if (error.code === '23505') return { error: `A vendor with email ${vendor.email} already exists.` }
      return { error: 'Could not create the vendor invitation.' }
    }
  }

  const mail = await sendInviteEmail({
    to: vendor.email,
    companyName,
    vendorName: vendor.vendor_name,
    token: rawToken,
    req,
  })

  const base = appBase(req)
  return {
    email: vendor.email,
    emailQueued: mail.sent,
    emailNote: mail.reason,
    inviteLink: base ? `${base}/onboard/${rawToken}` : `/onboard/${rawToken}`,
  }
}

export function serviceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return null
  return createClient(supabaseUrl, serviceKey)
}
