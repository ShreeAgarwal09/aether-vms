import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type VendorInput = {
  vendor_name?: string
  email?: string
  vendor_phone?: string
}

type Payload = {
  action?: 'invite_vendor' | 'invite_vendors_bulk' | 'resend_invite'
  vendor?: VendorInput
  vendors?: VendorInput[]
  vendorId?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INDIAN_PHONE_RE = /^(?:\+91[-\s]?|0)?[6-9]\d{9}$/

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function clean(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

function normalizePhone(value: string) {
  return value.replace(/[\s-]/g, '')
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function newToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function appBase(req: Request) {
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

async function sendInviteEmail(options: {
  to: string
  companyName: string
  vendorName: string
  token: string
  req: Request
}) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('EMAIL_FROM')
  if (!apiKey || !from) {
    return { sent: false, reason: 'Email delivery is pending RESEND_API_KEY and EMAIL_FROM.' }
  }

  const base = appBase(options.req)
  const link = base ? `${base}/onboard/${options.token}` : null
  const html = `
    <p>Hello ${options.vendorName},</p>
    <p>${options.companyName} has invited you to complete vendor onboarding.</p>
    ${
      link
        ? `<p>Your secure invitation link (the vendor form opens in a later release):<br /><a href="${link}">${link}</a></p>`
        : '<p>Your invitation has been recorded. A secure form link will be issued when vendor onboarding is enabled.</p>'
    }
    <p>This message does not create a login account.</p>
  `

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [options.to],
      subject: `Vendor invitation from ${options.companyName}`,
      html,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    return { sent: false, reason: `Email provider rejected the message. ${detail}` }
  }

  return { sent: true as const, reason: null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: 'Authorization required.' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server is missing privileged Supabase configuration.' }, 500)
  }

  const service = createClient(supabaseUrl, serviceKey)
  const token = auth.replace(/^Bearer\s+/i, '')
  const {
    data: { user },
    error: userError,
  } = await service.auth.getUser(token)
  if (userError || !user) return json({ error: 'Invalid session.' }, 401)

  const { data: caller } = await service
    .from('profiles')
    .select('id, role, is_active, company_name, email')
    .eq('id', user.id)
    .maybeSingle()

  if (!caller || caller.role !== 'company' || !caller.is_active) {
    return json({ error: 'Active company access required.' }, 403)
  }

  const companyName = caller.company_name || caller.email
  let body: Payload
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400)
  }

  async function persistInvite(input: VendorInput, existingId?: string) {
    const parsed = validateVendor(input)
    if ('error' in parsed && parsed.error) return { error: parsed.error }

    const vendor = parsed as { vendor_name: string; email: string; vendor_phone: string }
    const rawToken = newToken()
    const hash = await sha256Hex(rawToken)

    if (existingId) {
      const { data: existing } = await service
        .from('vendors')
        .select('id, company_user_id')
        .eq('id', existingId)
        .maybeSingle()
      if (!existing || existing.company_user_id !== caller.id) {
        return { error: 'Vendor not found.' }
      }
      const { error } = await service
        .from('vendors')
        .update({
          vendor_name: vendor.vendor_name,
          vendor_phone_number: vendor.vendor_phone,
          invite_token_hash: hash,
          invited_at: new Date().toISOString(),
          status: 'invited',
        })
        .eq('id', existingId)
        .eq('company_user_id', caller.id)
      if (error) return { error: error.message }
    } else {
      const { error } = await service.from('vendors').insert({
        company_user_id: caller.id,
        vendor_name: vendor.vendor_name,
        email: vendor.email,
        vendor_phone_number: vendor.vendor_phone,
        status: 'invited',
        invite_token_hash: hash,
        invited_at: new Date().toISOString(),
      })
      if (error) {
        if (error.code === '23505') return { error: `A vendor with email ${vendor.email} already exists.` }
        return { error: error.message }
      }
    }

    const mail = await sendInviteEmail({
      to: vendor.email,
      companyName,
      vendorName: vendor.vendor_name,
      token: rawToken,
      req,
    })

    return {
      email: vendor.email,
      emailQueued: mail.sent,
      emailNote: mail.reason,
    }
  }

  if (body.action === 'invite_vendor') {
    const result = await persistInvite(body.vendor ?? {})
    if ('error' in result && result.error) return json({ error: result.error }, 400)
    return json({
      success: true,
      ...result,
      message: result.emailQueued
        ? 'Vendor invited and email queued.'
        : `Vendor invited. ${result.emailNote ?? 'Configure RESEND_API_KEY and EMAIL_FROM to send mail.'}`,
    })
  }

  if (body.action === 'resend_invite') {
    const vendorId = clean(body.vendorId)
    if (!vendorId) return json({ error: 'Vendor id is required.' }, 400)
    const { data: existing } = await service
      .from('vendors')
      .select('id, vendor_name, email, vendor_phone_number, company_user_id')
      .eq('id', vendorId)
      .maybeSingle()
    if (!existing || existing.company_user_id !== caller.id) {
      return json({ error: 'Vendor not found.' }, 404)
    }
    const result = await persistInvite(
      {
        vendor_name: existing.vendor_name ?? '',
        email: existing.email,
        vendor_phone: existing.vendor_phone_number ?? '',
      },
      existing.id,
    )
    if ('error' in result && result.error) return json({ error: result.error }, 400)
    return json({
      success: true,
      ...result,
      message: result.emailQueued
        ? 'Set-password / invitation email queued.'
        : `Invitation token rotated. ${result.emailNote ?? 'Configure RESEND_API_KEY and EMAIL_FROM to send mail.'}`,
    })
  }

  if (body.action === 'invite_vendors_bulk') {
    const rows = Array.isArray(body.vendors) ? body.vendors.slice(0, 200) : []
    if (!rows.length) return json({ error: 'Upload at least one vendor row.' }, 400)
    const results: Array<{ email?: string; ok: boolean; error?: string; emailQueued?: boolean }> = []
    for (const row of rows) {
      const result = await persistInvite(row)
      if ('error' in result && result.error) {
        results.push({ email: clean(row.email) ?? undefined, ok: false, error: result.error })
      } else {
        results.push({ email: result.email, ok: true, emailQueued: result.emailQueued })
      }
    }
    return json({
      success: true,
      results,
      created: results.filter((row) => row.ok).length,
      failed: results.filter((row) => !row.ok).length,
    })
  }

  return json({ error: 'Unsupported action.' }, 400)
})
