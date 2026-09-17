export type ResendResult = { sent: boolean; reason: string | null }

function appBase(req: Request) {
  return (Deno.env.get('APP_BASE_URL') || req.headers.get('origin') || '').replace(/\/$/, '')
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

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

export async function sendApprovalEmail(options: {
  to: string
  companyName: string
  vendorName: string
}) {
  const html = `
    <p>Hello ${escapeHtml(options.vendorName)},</p>
    <p>${escapeHtml(options.companyName)} has approved your vendor onboarding submission.</p>
    <p>Your registration is complete. If ERP posting is configured, your details may already be syncing to Business Central.</p>
  `
  return sendResendEmail({
    to: options.to,
    subject: `Vendor form approved — ${options.companyName}`,
    html,
  })
}

export async function sendInviteEmail(options: {
  to: string
  companyName: string
  vendorName: string
  token: string
  req: Request
}) {
  const base = appBase(options.req)
  const link = base ? `${base}/onboard/${options.token}` : null
  const html = `
    <p>Hello ${escapeHtml(options.vendorName)},</p>
    <p>${escapeHtml(options.companyName)} has invited you to complete vendor onboarding from Business Central contacts.</p>
    ${
      link
        ? `<p>Complete onboarding here (no login required):<br /><a href="${link}">${link}</a></p>`
        : '<p>Ask the company for your secure onboarding link.</p>'
    }
  `
  return sendResendEmail({
    to: options.to,
    subject: `Vendor invitation from ${options.companyName}`,
    html,
  })
}
