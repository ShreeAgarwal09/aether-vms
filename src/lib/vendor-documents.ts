export const SINGLE_VENDOR_DOCUMENT_TYPES = [
  'cancelled_cheque',
  'gst_certificate',
  'pan_card',
  'aadhaar_card',
  'aadhaar_declaration',
  'msme_certificate',
  'e_invoice',
  'declaration_non_e_invoicing',
  'udhyam_certificate',
  'declaration_194q',
  'declaration_206ab',
] as const

export type VendorDocumentKind =
  | (typeof SINGLE_VENDOR_DOCUMENT_TYPES)[number]
  | 'gst_location'
  | 'supporting_document'

export const DOCUMENT_LABELS: Record<VendorDocumentKind, string> = {
  cancelled_cheque: 'Cancelled cheque',
  gst_certificate: 'GST certificate',
  pan_card: 'PAN card',
  aadhaar_card: 'Aadhaar card',
  aadhaar_declaration: 'Aadhaar declaration linkage',
  msme_certificate: 'MSME certificate',
  e_invoice: 'E-invoice file',
  declaration_non_e_invoicing: 'Declaration for non-applicable e-invoicing',
  udhyam_certificate: 'Udhyam certificate',
  declaration_194q: 'Declaration for 194Q',
  declaration_206ab: 'Declaration for 206AB',
  gst_location: 'GST location certificate',
  supporting_document: 'Supporting document',
}
