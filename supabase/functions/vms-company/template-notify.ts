import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { appBase, json, sha256Hex } from './invite.ts'
import { sendTemplateUpdatedEmail } from './email.ts'

function newToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function handleNotifyTemplateUpdated(
  service: SupabaseClient,
  callerId: string,
  companyName: string,
  req: Request,
  templateId: string,
) {
  const { data: template } = await service
    .from('vendor_form_templates')
    .select('id, name, is_active, company_user_id')
    .eq('id', templateId)
    .maybeSingle()

  if (!template || template.company_user_id !== callerId) {
    return json({ error: 'Template not found.' }, 404)
  }

  if (!template.is_active) {
    return json({ error: 'Only the active template triggers vendor notifications.' }, 400)
  }

  const { data: vendors } = await service
    .from('vendors')
    .select('id, email, vendor_name, status, invite_token_hash')
    .eq('company_user_id', callerId)
    .in('status', ['invited', 'rejected'])

  const base = appBase(req)
  let emailed = 0
  let skipped = 0
  const results: Array<{ email: string; ok: boolean; error?: string }> = []

  for (const vendor of vendors ?? []) {
    if (!vendor.email) {
      skipped += 1
      continue
    }

    let link: string | null = null
    if (vendor.status === 'rejected' || !vendor.invite_token_hash) {
      const rawToken = newToken()
      const hash = await sha256Hex(rawToken)
      const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      await service
        .from('vendors')
        .update({
          invite_token_hash: hash,
          invite_expires_at: expires,
          invited_at: new Date().toISOString(),
        })
        .eq('id', vendor.id)
      link = base ? `${base}/onboard/${rawToken}` : null
    }

    const mail = await sendTemplateUpdatedEmail({
      to: vendor.email,
      companyName,
      vendorName: String(vendor.vendor_name || 'Vendor'),
      templateName: template.name,
      onboardingLink: link,
    })

    if (mail.sent) {
      emailed += 1
      results.push({ email: vendor.email, ok: true })
    } else {
      results.push({ email: vendor.email, ok: false, error: mail.reason ?? 'Email not sent.' })
    }
  }

  return json({
    success: true,
    emailed,
    skipped,
    results,
    message:
      emailed > 0
        ? `Form update notification sent to ${emailed} vendor(s) via Resend.`
        : 'No vendor notification emails were sent. Configure RESEND_API_KEY and EMAIL_FROM, or no eligible vendors exist.',
  })
}
