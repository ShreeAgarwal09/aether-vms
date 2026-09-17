import { clean, corsHeaders, json, persistInvite, serviceClient } from './invite.ts'
import { handleGetReview, handleReviewVendor, handleSignDocument } from './review.ts'
import { handleNotifyTemplateUpdated } from './template-notify.ts'
import { handleDeleteVendor, handleSetVendorBlocked } from './vendor-actions.ts'

type Payload = {
  action?: string
  vendor?: { vendor_name?: string; email?: string; vendor_phone?: string }
  vendors?: Array<{ vendor_name?: string; email?: string; vendor_phone?: string }>
  vendorId?: string
  documentId?: string
  decision?: string
  reason?: string
  revealAccount?: boolean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: 'Authorization required.' }, 401)

  const service = serviceClient()
  if (!service) return json({ error: 'Server is missing privileged Supabase configuration.' }, 500)

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

  if (body.action === 'invite_vendor') {
    const result = await persistInvite(service, caller.id, companyName, req, body.vendor ?? {})
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
      service,
      caller.id,
      companyName,
      req,
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
    const results: Array<{ email?: string; ok: boolean; error?: string; emailQueued?: boolean; inviteLink?: string }> = []
    for (const row of rows) {
      const result = await persistInvite(service, caller.id, companyName, req, row)
      if ('error' in result && result.error) {
        results.push({ email: clean(row.email) ?? undefined, ok: false, error: result.error })
      } else {
        results.push({ email: result.email, ok: true, emailQueued: result.emailQueued, inviteLink: result.inviteLink })
      }
    }
    return json({
      success: true,
      results,
      created: results.filter((row) => row.ok).length,
      failed: results.filter((row) => row.ok === false).length,
    })
  }

  if (body.action === 'get_vendor_review') {
    const vendorId = clean(body.vendorId)
    if (!vendorId) return json({ error: 'Vendor id is required.' }, 400)
    return handleGetReview(service, caller.id, vendorId, Boolean(body.revealAccount))
  }

  if (body.action === 'sign_vendor_document') {
    const vendorId = clean(body.vendorId)
    const documentId = clean(body.documentId)
    if (!vendorId || !documentId) return json({ error: 'Vendor and document ids are required.' }, 400)
    return handleSignDocument(service, caller.id, vendorId, documentId)
  }

  if (body.action === 'review_vendor') {
    const vendorId = clean(body.vendorId)
    const decision = clean(body.decision)
    if (!vendorId) return json({ error: 'Vendor id is required.' }, 400)
    if (decision !== 'approve' && decision !== 'reject') return json({ error: 'Invalid review action.' }, 400)
    return handleReviewVendor(service, caller.id, companyName, req, vendorId, decision, body.reason)
  }

  if (body.action === 'delete_vendor') {
    const vendorId = clean(body.vendorId)
    if (!vendorId) return json({ error: 'Vendor id is required.' }, 400)
    return handleDeleteVendor(service, caller.id, vendorId)
  }

  if (body.action === 'set_vendor_blocked') {
    const vendorId = clean(body.vendorId)
    if (!vendorId) return json({ error: 'Vendor id is required.' }, 400)
    if (typeof body.blocked !== 'boolean') return json({ error: 'blocked must be a boolean.' }, 400)
    return handleSetVendorBlocked(service, caller.id, vendorId, body.blocked)
  }

  if (body.action === 'notify_template_updated') {
    const templateId = clean(body.templateId)
    if (!templateId) return json({ error: 'Template id is required.' }, 400)
    return handleNotifyTemplateUpdated(service, caller.id, companyName, req, templateId)
  }

  return json({ error: 'Unsupported action.' }, 400)
})
