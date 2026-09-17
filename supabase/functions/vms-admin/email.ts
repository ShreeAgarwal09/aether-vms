export type ResendResult = { sent: boolean; reason: string | null }

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

export async function sendSetPasswordEmail(options: {
  to: string
  fullName: string
  companyName: string
  actionLink: string
}) {
  const html = `
    <p>Hello ${escapeHtml(options.fullName)},</p>
    <p>Your company account for <strong>${escapeHtml(options.companyName)}</strong> is ready in Aether VMS.</p>
    <p>Set your password using this secure link:<br /><a href="${options.actionLink}">${options.actionLink}</a></p>
    <p>After setting your password, sign in to invite vendors and manage onboarding.</p>
  `
  return sendResendEmail({
    to: options.to,
    subject: 'Set your Aether VMS password',
    html,
  })
}

export async function sendPasswordResetEmail(options: {
  to: string
  fullName: string
  actionLink: string
}) {
  const html = `
    <p>Hello ${escapeHtml(options.fullName)},</p>
    <p>We received a request to reset your Aether VMS password.</p>
    <p>Use this secure link to choose a new password:<br /><a href="${options.actionLink}">${options.actionLink}</a></p>
    <p>If you did not request this, you can ignore this email.</p>
  `
  return sendResendEmail({
    to: options.to,
    subject: 'Reset your Aether VMS password',
    html,
  })
}
