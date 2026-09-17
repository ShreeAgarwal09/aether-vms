import { appBase } from './invite.ts'

export type ResendResult = { sent: boolean; reason: string | null }

export async function sendResendEmail(options: {
  to: string
  subject: string
  html: string
}): Promise<ResendResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('EMAIL_FROM')
  if (!apiKey || !from) {
    return { sent: false, reason: 'Email delivery requires RESEND_API_KEY and EMAIL_FROM.' }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [options.to],
      subject: options.subject,
      html: options.html,
    }),
  })

  if (!response.ok) {
    await response.text()
    return { sent: false, reason: 'Email provider rejected the message.' }
  }

  return { sent: true, reason: null }
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function onboardingLink(req: Request, token: string) {
  const base = appBase(req)
  return base ? `${base}/onboard/${token}` : null
}

export async function sendInviteEmail(options: {
  to: string
  companyName: string
  vendorName: string
  token: string
  req: Request
}) {
  const link = onboardingLink(options.req, options.token)
  const html = `
    <p>Hello ${escapeHtml(options.vendorName)},</p>
    <p>${escapeHtml(options.companyName)} has invited you to complete vendor onboarding.</p>
    ${
      link
        ? `<p>Complete your vendor onboarding using this secure link (no login is required):<br /><a href="${link}">${link}</a></p>
           <p>The link is unique to you and expires. Do not share it.</p>`
        : '<p>Your invitation has been recorded. Ask the company for the secure onboarding link if this email has no URL (APP_BASE_URL is not configured).</p>'
    }
    <p>This message does not create a login account.</p>
  `
  return sendResendEmail({
    to: options.to,
    subject: `Vendor invitation from ${options.companyName}`,
    html,
  })
}

export async function sendApprovalEmail(options: {
  to: string
  companyName: string
  vendorName: string
  req: Request
}) {
  const html = `
    <p>Hello ${escapeHtml(options.vendorName)},</p>
    <p>${escapeHtml(options.companyName)} has approved your vendor onboarding submission.</p>
    <p>Your registration is complete. If ERP posting is configured, your details may already be syncing to Business Central.</p>
    <p>Thank you for registering with ${escapeHtml(options.companyName)}.</p>
  `
  return sendResendEmail({
    to: options.to,
    subject: `Vendor form approved — ${options.companyName}`,
    html,
  })
}

export async function sendRejectionEmail(options: {
  to: string
  companyName: string
  vendorName: string
  reason: string
  onboardingLink?: string | null
  req: Request
}) {
  const link = options.onboardingLink ?? null
  const html = `
    <p>Hello ${escapeHtml(options.vendorName)},</p>
    <p>${escapeHtml(options.companyName)} reviewed your vendor onboarding submission and needs corrections.</p>
    <p><strong>Reason:</strong> ${escapeHtml(options.reason)}</p>
    ${
      link
        ? `<p>Update your submission using this secure onboarding link:<br /><a href="${link}">${link}</a></p>`
        : '<p>Open the secure onboarding link from your original invitation, update the requested information, and resubmit.</p>'
    }
    <p>This message does not include bank details, PAN, Aadhaar, or other sensitive documents.</p>
  `
  return sendResendEmail({
    to: options.to,
    subject: `Vendor form resubmission request — ${options.companyName}`,
    html,
  })
}

export async function sendTemplateUpdatedEmail(options: {
  to: string
  companyName: string
  vendorName: string
  templateName: string
  onboardingLink?: string | null
}) {
  const html = `
    <p>Hello ${escapeHtml(options.vendorName)},</p>
    <p>${escapeHtml(options.companyName)} updated the vendor onboarding form (${escapeHtml(options.templateName)}).</p>
    <p>If you have not submitted yet, or you need to resubmit, use your secure onboarding link to see the latest fields.</p>
    ${
      options.onboardingLink
        ? `<p><a href="${options.onboardingLink}">${options.onboardingLink}</a></p>`
        : '<p>If you no longer have your link, ask the company to resend the invitation.</p>'
    }
  `
  return sendResendEmail({
    to: options.to,
    subject: `Vendor form updated — ${options.companyName}`,
    html,
  })
}
