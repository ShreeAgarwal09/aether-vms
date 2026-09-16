import type { FieldOption, FieldType, FieldValidation, FormField } from '@/lib/form-builder'
import { EMAIL_PATTERN, GST_PATTERN, INDIAN_PHONE_PATTERN } from '@/lib/validation'

export const PIN_PATTERN = /^[1-9][0-9]{5}$/
export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/
export const AADHAAR_PATTERN = /^[2-9][0-9]{11}$/

export const VENDOR_TYPES = ['Manufacturer', 'Distributor', 'Trader', 'Service provider', 'Other'] as const
export const GST_TYPES = ['Regular', 'Composition', 'SEZ', 'Unregistered'] as const
export const ACCOUNT_TYPES = ['Current', 'Savings'] as const

export type ContactPerson = {
  id: string
  name: string
  designation: string
  email: string
  mobile: string
  alternate_phone: string
  is_primary: boolean
}

export type GstLocation = {
  id: string
  location_name: string
  address: string
  city: string
  state: string
  pin: string
  gstin: string
}

export type DocRef = {
  id?: string
  kind: string
  filename: string
  content_type: string
  size: number
  path?: string
  signed_url?: string | null
}

export type OnboardingForm = {
  vendor_name: string
  legal_name: string
  vendor_type: string
  contacts: ContactPerson[]
  registered_address: string
  address_line: string
  city: string
  state: string
  pin: string
  country: string
  gst_number: string
  gst_registration_type: string
  gst_locations: GstLocation[]
  bank_name: string
  account_holder_name: string
  account_number: string
  ifsc: string
  branch: string
  account_type: string
  cancelled_cheque: DocRef | null
  pan: string
  aadhaar_input: string
  aadhaar_masked: string | null
  tds_details: string
  assessee_code: string
  company_registration: string
  company_description: string
  msme: boolean
  msme_number: string
  iec_registered: boolean
  iec_number: string
  declaration_accurate: boolean
  additional_information: string
  supporting_docs: DocRef[]
  custom: Record<string, string | boolean | number | null>
}

export type SnapshotField = {
  id: string
  field_key: string
  label: string
  field_type: FieldType
  placeholder: string | null
  help_text: string | null
  is_required: boolean
  options: FieldOption[]
  validation_rules: FieldValidation
  sort_order: number
}

export function emptyContact(): ContactPerson {
  return {
    id: crypto.randomUUID(),
    name: '',
    designation: '',
    email: '',
    mobile: '',
    alternate_phone: '',
    is_primary: true,
  }
}

export function emptyGstLocation(): GstLocation {
  return {
    id: crypto.randomUUID(),
    location_name: '',
    address: '',
    city: '',
    state: '',
    pin: '',
    gstin: '',
  }
}

export function emptyOnboardingForm(): OnboardingForm {
  return {
    vendor_name: '',
    legal_name: '',
    vendor_type: '',
    contacts: [emptyContact()],
    registered_address: '',
    address_line: '',
    city: '',
    state: '',
    pin: '',
    country: 'India',
    gst_number: '',
    gst_registration_type: '',
    gst_locations: [],
    bank_name: '',
    account_holder_name: '',
    account_number: '',
    ifsc: '',
    branch: '',
    account_type: '',
    cancelled_cheque: null,
    pan: '',
    aadhaar_input: '',
    aadhaar_masked: null,
    tds_details: '',
    assessee_code: '',
    company_registration: '',
    company_description: '',
    msme: false,
    msme_number: '',
    iec_registered: false,
    iec_number: '',
    declaration_accurate: false,
    additional_information: '',
    supporting_docs: [],
    custom: {},
  }
}

export function digitsOnly(value: string) {
  return value.replace(/\D/g, '')
}

export function validateStep(
  step: number,
  form: OnboardingForm,
  fields: SnapshotField[] | FormField[],
  mode: 'progress' | 'submit',
) {
  const errors: Record<string, string> = {}
  const requireAll = mode === 'submit' || true

  if (step === 1) {
    if (!form.vendor_name.trim()) errors.vendor_name = 'Vendor / company name is required.'
    if (!form.vendor_type.trim()) errors.vendor_type = 'Select a vendor type.'
    if (!form.contacts.length) errors.contacts = 'Add at least one contact person.'
    const primaries = form.contacts.filter((item) => item.is_primary)
    if (primaries.length !== 1) errors.contacts = 'Mark exactly one contact as primary.'
    form.contacts.forEach((contact, index) => {
      if (!contact.name.trim()) errors[`contact_${index}_name`] = 'Name is required.'
      if (!contact.email.trim() || !EMAIL_PATTERN.test(contact.email.trim())) {
        errors[`contact_${index}_email`] = 'Enter a valid email.'
      }
      if (!INDIAN_PHONE_PATTERN.test(contact.mobile.replace(/[\s-]/g, ''))) {
        errors[`contact_${index}_mobile`] = 'Enter a valid Indian mobile number.'
      }
      if (contact.alternate_phone.trim() && !INDIAN_PHONE_PATTERN.test(contact.alternate_phone.replace(/[\s-]/g, ''))) {
        errors[`contact_${index}_alternate`] = 'Enter a valid alternate number.'
      }
    })
  }

  if (step === 2) {
    if (!form.registered_address.trim()) errors.registered_address = 'Registered address is required.'
    if (!form.address_line.trim()) errors.address_line = 'Address line is required.'
    if (!form.city.trim()) errors.city = 'City is required.'
    if (!form.state.trim()) errors.state = 'State is required.'
    if (!PIN_PATTERN.test(form.pin.trim())) errors.pin = 'Enter a valid 6-digit PIN code.'
    if (!form.country.trim()) errors.country = 'Country is required.'
    if (!form.gst_registration_type.trim()) errors.gst_registration_type = 'Select a GST registration type.'
    if (form.gst_registration_type !== 'Unregistered') {
      if (!GST_PATTERN.test(form.gst_number.trim().toUpperCase())) {
        errors.gst_number = 'Enter a valid 15-character GSTIN. Format is checked, not government-verified.'
      }
    }
    form.gst_locations.forEach((location, index) => {
      if (!location.location_name.trim()) errors[`gst_${index}_name`] = 'Location name is required.'
      if (!location.address.trim()) errors[`gst_${index}_address`] = 'Address is required.'
      if (!location.city.trim()) errors[`gst_${index}_city`] = 'City is required.'
      if (!location.state.trim()) errors[`gst_${index}_state`] = 'State is required.'
      if (!PIN_PATTERN.test(location.pin.trim())) errors[`gst_${index}_pin`] = 'Enter a valid PIN.'
      if (!GST_PATTERN.test(location.gstin.trim().toUpperCase())) {
        errors[`gst_${index}_gstin`] = 'Enter a valid GSTIN for this location.'
      }
    })
  }

  if (step === 3) {
    if (!form.bank_name.trim()) errors.bank_name = 'Bank name is required.'
    if (!form.account_holder_name.trim()) errors.account_holder_name = 'Account holder name is required.'
    if (!/^\d{9,18}$/.test(form.account_number.trim())) errors.account_number = 'Enter a valid account number.'
    if (!IFSC_PATTERN.test(form.ifsc.trim().toUpperCase())) errors.ifsc = 'Enter a valid IFSC code.'
    if (!form.branch.trim()) errors.branch = 'Branch is required.'
    if (!form.account_type.trim()) errors.account_type = 'Select an account type.'
    if (mode === 'submit' && !form.cancelled_cheque) errors.cancelled_cheque = 'Upload a cancelled cheque.'
  }

  if (step === 4) {
    if (!PAN_PATTERN.test(form.pan.trim().toUpperCase())) errors.pan = 'Enter a valid PAN.'
    const aadhaarDigits = digitsOnly(form.aadhaar_input)
    if (aadhaarDigits) {
      if (!AADHAAR_PATTERN.test(aadhaarDigits)) errors.aadhaar_input = 'Enter a valid 12-digit Aadhaar number.'
    } else if (mode === 'submit' && !form.aadhaar_masked) {
      errors.aadhaar_input = 'Aadhaar is required. Only the last four digits are stored.'
    }
    if (!form.assessee_code.trim()) errors.assessee_code = 'Assessee code is required.'
    if (!form.company_registration.trim()) errors.company_registration = 'Company registration details are required.'
  }

  if (step === 5) {
    if (form.msme && !form.msme_number.trim()) errors.msme_number = 'Enter the MSME number.'
    if (form.iec_registered && !form.iec_number.trim()) errors.iec_number = 'Enter the IEC number.'
    if (mode === 'submit' && !form.declaration_accurate) {
      errors.declaration_accurate = 'Confirm the declaration before submitting.'
    }
    for (const field of fields) {
      const value = form.custom[field.field_key]
      const label = field.label
      if (field.is_required) {
        if (field.field_type === 'checkbox' && value !== true) errors[`custom_${field.field_key}`] = `${label} is required.`
        else if (value === undefined || value === null || String(value).trim() === '') {
          errors[`custom_${field.field_key}`] = `${label} is required.`
        }
      }
      if (value === undefined || value === null || value === '') continue
      if (field.field_type === 'email' && typeof value === 'string' && !EMAIL_PATTERN.test(value)) {
        errors[`custom_${field.field_key}`] = `${label} must be a valid email.`
      }
      if (field.field_type === 'integer') {
        const number = Number(value)
        if (!Number.isInteger(number)) errors[`custom_${field.field_key}`] = `${label} must be a whole number.`
        const min = field.validation_rules.min
        const max = field.validation_rules.max
        if (min != null && number < min) errors[`custom_${field.field_key}`] = `${label} must be at least ${min}.`
        if (max != null && number > max) errors[`custom_${field.field_key}`] = `${label} must be at most ${max}.`
      }
      if (field.field_type === 'text' && typeof value === 'string') {
        const minLength = field.validation_rules.minLength
        const maxLength = field.validation_rules.maxLength
        if (minLength != null && value.length < minLength) {
          errors[`custom_${field.field_key}`] = `${label} must be at least ${minLength} characters.`
        }
        if (maxLength != null && value.length > maxLength) {
          errors[`custom_${field.field_key}`] = `${label} must be at most ${maxLength} characters.`
        }
      }
      if ((field.field_type === 'dropdown' || field.field_type === 'radio') && typeof value === 'string') {
        if (!field.options.some((option) => option.value === value)) {
          errors[`custom_${field.field_key}`] = `Choose a valid option for ${label}.`
        }
      }
    }
  }

  void requireAll
  return errors
}

export const STEP_TITLES = [
  'Basic details',
  'Address & GST',
  'Bank details',
  'Company details',
  'Other details',
]

export const ALLOWED_UPLOAD_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

