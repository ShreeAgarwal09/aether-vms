export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const GST_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
export const PHONE_PATTERN = /^[0-9+\-()\s]{7,20}$/

export function validateCompanyForm(values: {
  full_name: string
  email: string
  company_name: string
  company_mobile_number: string
  gst_number: string
}, options?: { requireEmail?: boolean }) {
  const errors: Record<string, string> = {}
  if (!values.full_name.trim()) errors.full_name = 'Full name is required.'
  if (options?.requireEmail !== false) {
    if (!values.email.trim()) errors.email = 'Email is required.'
    else if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = 'Enter a valid email address.'
  }
  if (!values.company_name.trim()) errors.company_name = 'Company name is required.'
  if (values.company_mobile_number.trim() && !PHONE_PATTERN.test(values.company_mobile_number.trim())) {
    errors.company_mobile_number = 'Enter a valid phone number.'
  }
  const gst = values.gst_number.trim().toUpperCase()
  if (gst && !GST_PATTERN.test(gst)) {
    errors.gst_number = 'Enter a valid 15-character GSTIN.'
  }
  return errors
}
