import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  clean,
  corsHeaders,
  ensureSnapshot,
  handleUpload,
  inviteUsable,
  json,
  loadVendor,
  persistForm,
  publicPayload,
  rateLimit,
  snapshotFields,
  validateCore,
  validateCustom,
  clientIp,
  invalid,
} from './validate.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server is missing privileged configuration.' }, 500)
  const service = createClient(supabaseUrl, serviceKey)

  const contentType = req.headers.get('content-type') || ''
  let action = ''
  let token = ''
  let form: Record<string, unknown> = {}
  let step = 1
  let kind = ''
  let file: File | null = null

  try {
    if (contentType.includes('multipart/form-data')) {
      const data = await req.formData()
      action = clean(data.get('action'))
      token = clean(data.get('token')).toLowerCase()
      kind = clean(data.get('kind'))
      const uploaded = data.get('file')
      file = uploaded instanceof File ? uploaded : null
    } else {
      const body = await req.json()
      action = clean(body.action)
      token = clean(body.token).toLowerCase()
      form = body.form && typeof body.form === 'object' ? body.form : {}
      step = Number(body.step) || 1
    }
  } catch {
    return json({ error: 'Invalid request.' }, 400)
  }

  if (!await rateLimit(service, req, token || clientIp(req))) {
    return json({ error: 'Too many attempts. Try again later.' }, 429)
  }

  const vendor = await loadVendor(service, token)
  if (!vendor || !inviteUsable(vendor)) return invalid()

  if (action === 'validate_invite' || action === 'get_onboarding_data') {
    if (vendor.status === 'pending' || vendor.status === 'approved') {
      const fresh = await ensureSnapshot(service, vendor)
      return json({ data: await publicPayload(service, fresh) })
    }
    const fresh = await ensureSnapshot(service, vendor)
    return json({ data: await publicPayload(service, fresh) })
  }

  if (vendor.status === 'pending' || vendor.status === 'approved') {
    return json({ error: 'This invitation has already been submitted.', code: 'already_submitted' }, 409)
  }

  if (action === 'upload_document') {
    if (!file) return json({ error: 'A file is required.' }, 400)
    return handleUpload(service, vendor, kind, file)
  }

  if (action === 'save_onboarding_progress' || action === 'submit_vendor') {
    const submit = action === 'submit_vendor'
    const currentStep = Math.min(5, Math.max(1, step))
    const fresh = await ensureSnapshot(service, vendor)
    const fields = snapshotFields(fresh)
    const allowed = new Set(fields.map((field) => field.field_key))
    if (form.custom && typeof form.custom === 'object') {
      form.custom = Object.fromEntries(
        Object.entries(form.custom as Record<string, unknown>).filter(([key]) => allowed.has(key)),
      )
    }
    if (submit) {
      const errors = [
        ...validateCore(form, 5, true),
        ...validateCustom(fields, (form.custom as Record<string, unknown>) ?? {}, true),
      ]
      if (errors.length) return json({ error: errors[0], details: errors }, 400)
      const { count } = await service.from('vendor_documents').select('id', { count: 'exact', head: true }).eq('vendor_id', vendor.id).eq('document_type', 'cancelled_cheque')
      if (!count) return json({ error: 'Cancelled cheque is required.' }, 400)
    }
    const persistError = await persistForm(service, fresh, form, currentStep)
    if (persistError) return json({ error: persistError }, 400)
    if (submit) {
      const wasRejected = fresh.status === 'rejected'
      const now = new Date().toISOString()
      const { error } = await service.from('vendors').update({
        status: 'pending',
        submitted_at: now,
        resubmitted_at: wasRejected ? now : fresh.resubmitted_at ?? null,
        invite_consumed_at: now,
        current_step: 5,
      }).eq('id', vendor.id).in('status', ['invited', 'rejected'])
      if (error) return json({ error: 'Could not submit the form.' }, 400)
      await service.from('vendor_review_history').insert({
        vendor_id: vendor.id,
        company_user_id: null,
        action: wasRejected ? 'resubmitted' : 'submitted',
        reason: null,
      })
      const { data: after } = await service.from('vendors').select('*').eq('id', vendor.id).maybeSingle()
      return json({
        message: 'Submitted. The company will review your information.',
        data: await publicPayload(service, after ?? vendor),
      })
    }
    const { data: after } = await service.from('vendors').select('*').eq('id', vendor.id).maybeSingle()
    return json({ saveState: 'saved', data: await publicPayload(service, after ?? fresh) })
  }

  return json({ error: 'Unsupported action.' }, 400)
})
