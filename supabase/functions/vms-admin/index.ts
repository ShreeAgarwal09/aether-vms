import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Action =
  | 'create_company_user'
  | 'set_company_active'
  | 'delete_company_user'
  | 'send_password_email'

type CompanyPayload = {
  action?: Action
  userId?: string
  email?: string
  full_name?: string
  company_name?: string
  company_mobile_number?: string
  company_address?: string
  gst_number?: string
  is_active?: boolean
}

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

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isGst(value: string) {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(value.toUpperCase())
}

function redirectTo(req: Request) {
  const configured = Deno.env.get('APP_BASE_URL')?.replace(/\/$/, '')
  const origin = req.headers.get('origin')?.replace(/\/$/, '')
  const base = configured || origin || ''
  return base ? `${base}/login` : undefined
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405)
  }

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
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!caller || caller.role !== 'admin' || !caller.is_active) {
    return json({ error: 'Admin access required.' }, 403)
  }

  let body: CompanyPayload
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400)
  }

  if (body.action === 'create_company_user') {
    const email = clean(body.email)?.toLowerCase()
    const fullName = clean(body.full_name)
    const companyName = clean(body.company_name)
    const mobile = clean(body.company_mobile_number)
    const address = clean(body.company_address)
    const gst = clean(body.gst_number)?.toUpperCase()

    if (!email || !isEmail(email)) return json({ error: 'A valid email is required.' }, 400)
    if (!fullName) return json({ error: 'Full name is required.' }, 400)
    if (!companyName) return json({ error: 'Company name is required.' }, 400)
    if (gst && !isGst(gst)) return json({ error: 'GST number format is invalid.' }, 400)

    const { data: invited, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, company_name: companyName },
      redirectTo: redirectTo(req),
    })

    if (inviteError || !invited.user) {
      return json({ error: inviteError?.message ?? 'Could not create the company user.' }, 400)
    }

    const { error: profileError } = await service
      .from('profiles')
      .update({
        email,
        full_name: fullName,
        company_name: companyName,
        company_mobile_number: mobile,
        company_address: address,
        gst_number: gst,
        role: 'company',
        is_active: true,
      })
      .eq('id', invited.user.id)

    if (profileError) {
      await service.auth.admin.deleteUser(invited.user.id)
      return json({ error: profileError.message }, 400)
    }

    return json({
      userId: invited.user.id,
      emailQueued: true,
      message:
        'Company user created. A set-password email was queued by Supabase Auth. Configure custom SMTP if mail is not arriving.',
    })
  }

  if (body.action === 'set_company_active') {
    const userId = clean(body.userId)
    if (!userId) return json({ error: 'Company user id is required.' }, 400)
    if (typeof body.is_active !== 'boolean') return json({ error: 'is_active must be a boolean.' }, 400)
    if (userId === user.id) return json({ error: 'You cannot change your own access from this action.' }, 400)

    const { data: target } = await service
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .maybeSingle()

    if (!target || target.role !== 'company') {
      return json({ error: 'Company user not found.' }, 404)
    }

    const { error: profileError } = await service
      .from('profiles')
      .update({ is_active: body.is_active })
      .eq('id', userId)
      .eq('role', 'company')

    if (profileError) return json({ error: profileError.message }, 400)

    await service.auth.admin.updateUserById(userId, {
      ban_duration: body.is_active ? 'none' : '876600h',
    })
    if (!body.is_active) {
      await service.auth.admin.signOut(userId, 'global')
    }

    return json({ success: true, is_active: body.is_active })
  }

  if (body.action === 'delete_company_user') {
    const userId = clean(body.userId)
    if (!userId) return json({ error: 'Company user id is required.' }, 400)
    if (userId === user.id) return json({ error: 'You cannot delete your own account from this action.' }, 400)

    const { data: target } = await service
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .maybeSingle()

    if (!target || target.role !== 'company') {
      return json({ error: 'Company user not found.' }, 404)
    }

    const { count, error: vendorCountError } = await service
      .from('vendors')
      .select('id', { count: 'exact', head: true })
      .eq('company_user_id', userId)

    if (vendorCountError && !/could not find the table|relation .* does not exist/i.test(vendorCountError.message)) {
      return json({ error: vendorCountError.message }, 400)
    }

    if ((count ?? 0) > 0) {
      return json(
        {
          error:
            'This company has vendor records. Block the account instead of deleting it so historical vendor data stays intact.',
        },
        409,
      )
    }

    await service.from('vendor_form_templates').delete().eq('company_user_id', userId)

    const { error: deleteError } = await service.auth.admin.deleteUser(userId)
    if (deleteError) return json({ error: deleteError.message }, 400)

    return json({ success: true })
  }

  if (body.action === 'send_password_email') {
    const userId = clean(body.userId)
    if (!userId) return json({ error: 'Company user id is required.' }, 400)

    const { data: target } = await service
      .from('profiles')
      .select('id, email, role, is_active')
      .eq('id', userId)
      .maybeSingle()

    if (!target || target.role !== 'company') {
      return json({ error: 'Company user not found.' }, 404)
    }

    const { error: resetError } = await service.auth.resetPasswordForEmail(target.email, {
      redirectTo: redirectTo(req),
    })

    if (resetError) {
      return json(
        {
          error: resetError.message,
          hint: 'Configure Auth SMTP (and APP_BASE_URL if using a custom site URL) in the Supabase project.',
        },
        503,
      )
    }

    return json({
      success: true,
      emailQueued: true,
      message: 'Set-password email queued through Supabase Auth.',
    })
  }

  return json({ error: 'Unsupported action.' }, 400)
})
