export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const GST_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
export const INDIAN_PHONE_PATTERN = /^(?:\+91[-\s]?|0)?[6-9]\d{9}$/

export function validateVendorInvite(values: {
  vendor_name: string
  email: string
  vendor_phone: string
}) {
  const errors: Record<string, string> = {}
  if (!values.vendor_name.trim()) errors.vendor_name = 'Vendor name is required.'
  if (!values.email.trim()) errors.email = 'Email is required.'
  else if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = 'Enter a valid email address.'
  if (!values.vendor_phone.trim()) errors.vendor_phone = 'Mobile number is required.'
  else if (!INDIAN_PHONE_PATTERN.test(values.vendor_phone.replace(/[\s-]/g, ''))) {
    errors.vendor_phone = 'Enter a valid 10-digit Indian mobile number.'
  }
  return errors
}

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
  if (values.company_mobile_number.trim() && !INDIAN_PHONE_PATTERN.test(values.company_mobile_number.replace(/[\s-]/g, ''))) {
    errors.company_mobile_number = 'Enter a valid Indian mobile number.'
  }
  const gst = values.gst_number.trim().toUpperCase()
  if (gst && !GST_PATTERN.test(gst)) {
    errors.gst_number = 'Enter a valid 15-character GSTIN.'
  }
  return errors
}
