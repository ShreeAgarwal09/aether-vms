const SENSITIVE = /access_token|refresh_token|authorization_code|service_role|client_secret|private key|postgres|sqlstate|stack trace|\/var\/|deno\.land/i

export function userFacingError(error: unknown, fallback: string) {
  const raw =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message
        : ''
  if (!raw || SENSITIVE.test(raw) || raw.length > 280) return fallback
  return raw
}

export const MESSAGES = {
  bcConnect: 'Unable to connect to Business Central. Please check the integration configuration.',
  bcValidate: 'Vendor validation failed. Please review the highlighted fields.',
  bcCreate: 'Business Central vendor creation failed. You can retry.',
  tallyUnreachable: 'Tally is unreachable. Check that Tally is running and the configured host/port are reachable.',
  generic: 'Something went wrong. Try again, or contact an administrator if it continues.',
  auth: 'Invalid email or password.',
}
