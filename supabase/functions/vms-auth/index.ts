import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function appBase(req: Request) {
  return (Deno.env.get('APP_BASE_URL') || req.headers.get('origin') || '').replace(/\/$/, '')
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function sendPasswordResetEmail(options: {
  to: string
  fullName: string
  actionLink: string
}) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('EMAIL_FROM')
  if (!apiKey || !from) return

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [options.to],
      subject: 'Reset your Aether VMS password',
      html: `
        <p>Hello ${escapeHtml(options.fullName)},</p>
        <p>We received a request to reset your Aether VMS password.</p>
        <p>Use this secure link to choose a new password:<br /><a href="${options.actionLink}">${options.actionLink}</a></p>
        <p>If you did not request this, you can ignore this email.</p>
      `,
    }),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server is missing privileged Supabase configuration.' }, 500)
  }

  let body: { action?: string; email?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400)
  }

  if (body.action !== 'request_password_reset') {
    return json({ error: 'Unsupported action.' }, 400)
  }

  const email = clean(body.email)?.toLowerCase()
  if (!email) return json({ success: true, message: 'If an account exists, a reset link has been sent.' })

  const service = createClient(supabaseUrl, serviceKey)
  const { data: profile } = await service
    .from('profiles')
    .select('email, full_name, role, is_active')
    .eq('email', email)
    .maybeSingle()

  if (!profile || !profile.is_active || (profile.role !== 'admin' && profile.role !== 'company')) {
    return json({ success: true, message: 'If an account exists, a reset link has been sent.' })
  }

  const base = appBase(req)
  const { data: linkData } = await service.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: base ? `${base}/reset-password` : undefined },
  })

  if (linkData?.properties?.action_link) {
    await sendPasswordResetEmail({
      to: email,
      fullName: profile.full_name || email,
      actionLink: linkData.properties.action_link,
    })
  }

  return json({ success: true, message: 'If an account exists, a reset link has been sent.' })
})
