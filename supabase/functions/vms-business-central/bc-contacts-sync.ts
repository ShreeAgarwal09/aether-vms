import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { bcFetch, connectionContext, companyUrl } from './bc-api.ts'
import { json, logSync } from './shared.ts'
import { sendInviteEmail } from './resend.ts'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function newToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function fetchAllContacts(token: string, root: string, companyId: string) {
  const rows: Array<Record<string, unknown>> = []
  let url: string | null = companyUrl(
    root,
    companyId,
    '/contacts?$select=id,number,displayName,email,type&$top=100',
  )

  while (url) {
    const { response, body } = await bcFetch(token, url)
    if (!response.ok) break
    const payload = body as { value?: Array<Record<string, unknown>>; '@odata.nextLink'?: string }
    rows.push(...(payload.value ?? []))
    url = payload['@odata.nextLink'] ?? null
  }

  return rows
}

export async function syncBcContacts(
  service: SupabaseClient,
  callerId: string,
  companyName: string,
  req: Request,
) {
  const ctx = await connectionContext(service, callerId)
  if ('error' in ctx) return json({ error: ctx.error.message, code: ctx.error.code }, 400)
  if (!ctx.conn.bc_company_id) {
    return json({ error: 'Select a Business Central company before syncing contacts.', code: 'company_not_found' }, 400)
  }

  const contacts = await fetchAllContacts(ctx.token, ctx.root, ctx.conn.bc_company_id)
  const { data: existing } = await service
    .from('vendors')
    .select('email')
    .eq('company_user_id', callerId)

  const known = new Set((existing ?? []).map((row: { email: string }) => row.email.toLowerCase()))
  const invited: string[] = []
  const skipped: string[] = []
  const failed: Array<{ email: string; error: string }> = []

  for (const contact of contacts) {
    const email = String(contact.email ?? '').trim().toLowerCase()
    if (!email || !EMAIL_RE.test(email)) {
      skipped.push(String(contact.displayName ?? contact.number ?? 'unknown'))
      continue
    }
    if (known.has(email)) {
      skipped.push(email)
      continue
    }

    const vendorName = String(contact.displayName ?? email.split('@')[0] ?? 'Vendor').slice(0, 120)
    const companyNo = contact.number ? String(contact.number) : null
    const bcCompanyName = ctx.conn.bc_company_name ?? companyName
    const rawToken = newToken()
    const hash = await sha256Hex(rawToken)
    const invitedAt = new Date()
    const expires = new Date(invitedAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()

    const { error } = await service.from('vendors').insert({
      company_user_id: callerId,
      vendor_name: vendorName,
      email,
      vendor_phone_number: '9000000000',
      status: 'invited',
      invite_token_hash: hash,
      invited_at: invitedAt.toISOString(),
      invite_expires_at: expires,
      company_no: companyNo,
      company_name: bcCompanyName,
    })

    if (error) {
      failed.push({ email, error: error.message })
      continue
    }

    known.add(email)
    const mail = await sendInviteEmail({
      to: email,
      companyName,
      vendorName,
      token: rawToken,
      req,
    })

    invited.push(email)
    if (!mail.sent) {
      failed.push({ email, error: mail.reason ?? 'Invite saved but email not sent.' })
    }
  }

  await logSync(service, {
    company_user_id: callerId,
    integration_type: 'business_central',
    operation: 'sync_bc_contacts',
    status: failed.length && !invited.length ? 'failed' : failed.length ? 'partial' : 'success',
    error_message: failed.length ? `${failed.length} invite(s) had delivery or insert issues.` : null,
  })

  return json({
    success: true,
    scanned: contacts.length,
    invited: invited.length,
    skipped: skipped.length,
    failed,
    invitedEmails: invited,
    message:
      invited.length > 0
        ? `Synced ${invited.length} new contact(s) from Business Central and queued invitation emails via Resend.`
        : 'No new Business Central contacts with email addresses were found to invite.',
  })
}
