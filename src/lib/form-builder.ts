export type FieldType = 'text' | 'email' | 'integer' | 'datetime' | 'dropdown' | 'radio' | 'checkbox'

export type FieldOption = { label: string; value: string }

export type FieldValidation = {
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  includeTime?: boolean
}

export type FormTemplate = {
  id: string
  company_user_id: string
  name: string
  description: string | null
  is_active: boolean
  version: number
  created_at: string
  updated_at: string
}

export type FormField = {
  id: string
  template_id: string
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

export const FIELD_TYPES: Array<{ type: FieldType; label: string; hint: string }> = [
  { type: 'text', label: 'Text', hint: 'Single line text' },
  { type: 'email', label: 'Email', hint: 'Email address' },
  { type: 'integer', label: 'Integer', hint: 'Whole number' },
  { type: 'datetime', label: 'Date & Time', hint: 'Date or date-time' },
  { type: 'dropdown', label: 'Dropdown', hint: 'Select one option' },
  { type: 'radio', label: 'Radio', hint: 'Choose one' },
  { type: 'checkbox', label: 'Checkbox', hint: 'Yes / no' },
]

export function slugifyKey(label: string) {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 62)
  if (!slug) return 'field'
  if (!/^[a-z]/.test(slug)) return `field_${slug}`.slice(0, 63)
  return slug
}

export function uniqueKey(
  base: string,
  existing: string[],
  ignoreId?: string,
  fields?: Array<{ id: string; field_key: string }>,
) {
  const taken = new Set(
    (fields ?? []).filter((field) => field.id !== ignoreId).map((field) => field.field_key),
  )
  existing.forEach((key) => taken.add(key))
  const safeBase = (base || 'field').slice(0, 63)
  if (!taken.has(safeBase)) return safeBase
  let index = 2
  while (taken.has(`${safeBase}_${index}`.slice(0, 63))) index += 1
  return `${safeBase}_${index}`.slice(0, 63)
}

export function isChoiceType(type: FieldType) {
  return type === 'dropdown' || type === 'radio'
}

export function normalizeField(row: {
  id: string
  template_id: string
  field_key: string
  label: string
  field_type: string
  placeholder: string | null
  help_text: string | null
  is_required: boolean
  options: unknown
  validation_rules: unknown
  sort_order: number
}): FormField {
  const options = Array.isArray(row.options)
    ? row.options
        .map((item) => {
          if (!item || typeof item !== 'object') return null
          const record = item as { label?: unknown; value?: unknown }
          const label = typeof record.label === 'string' ? record.label : ''
          const value = typeof record.value === 'string' ? record.value : slugifyKey(label)
          if (!label.trim()) return null
          return { label, value: value || slugifyKey(label) }
        })
        .filter((item): item is FieldOption => Boolean(item))
    : []
  const rules =
    row.validation_rules && typeof row.validation_rules === 'object' && !Array.isArray(row.validation_rules)
      ? (row.validation_rules as FieldValidation)
      : {}
  return {
    id: row.id,
    template_id: row.template_id,
    field_key: row.field_key,
    label: row.label,
    field_type: row.field_type as FieldType,
    placeholder: row.placeholder,
    help_text: row.help_text,
    is_required: Boolean(row.is_required),
    options,
    validation_rules: rules,
    sort_order: row.sort_order,
  }
}

export function duplicateField(field: FormField, fields: FormField[]): FormField[] {
  const index = fields.findIndex((item) => item.id === field.id)
  const copy: FormField = {
    ...field,
    id: crypto.randomUUID(),
    field_key: uniqueKey(field.field_key, [], undefined, fields),
    options: field.options.map((option) => ({ ...option })),
    validation_rules: { ...field.validation_rules },
  }
  const next = [...fields]
  next.splice(index < 0 ? fields.length : index + 1, 0, copy)
  return next.map((item, sort_order) => ({ ...item, sort_order }))
}

export function reindex(fields: FormField[]) {
  return fields.map((field, sort_order) => ({ ...field, sort_order }))
}

export function defaultOptions(type: FieldType): FieldOption[] {
  if (type === 'dropdown' || type === 'radio') {
    return [
      { label: 'Option 1', value: 'option_1' },
      { label: 'Option 2', value: 'option_2' },
    ]
  }
  return []
}

export function createDraftField(
  type: FieldType,
  templateId: string,
  existing: FormField[],
): FormField {
  const label = FIELD_TYPES.find((item) => item.type === type)?.label ?? 'Field'
  const field_key = uniqueKey(slugifyKey(label), [], undefined, existing)
  return {
    id: crypto.randomUUID(),
    template_id: templateId,
    field_key,
    label,
    field_type: type,
    placeholder: type === 'checkbox' ? null : `Enter ${label.toLowerCase()}`,
    help_text: null,
    is_required: false,
    options: defaultOptions(type),
    validation_rules: type === 'datetime' ? { includeTime: true } : {},
    sort_order: existing.length,
  }
}

export function validateFields(fields: FormField[]) {
  const errors: string[] = []
  const keys = new Map<string, string>()
  fields.forEach((field, index) => {
    if (!field.label.trim()) errors.push(`Field ${index + 1} needs a label.`)
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(field.field_key)) {
      errors.push(`“${field.label || field.field_key}” has an invalid field key.`)
    }
    const previous = keys.get(field.field_key)
    if (previous) errors.push(`Field key “${field.field_key}” is used more than once.`)
    keys.set(field.field_key, field.id)
    if ((field.field_type === 'dropdown' || field.field_type === 'radio') && field.options.length < 1) {
      errors.push(`“${field.label}” needs at least one option.`)
    }
    const lengths = field.validation_rules
    if (
      lengths.minLength != null &&
      lengths.maxLength != null &&
      lengths.minLength > lengths.maxLength
    ) {
      errors.push(`“${field.label}” minimum length cannot exceed maximum length.`)
    }
    if (lengths.min != null && lengths.max != null && lengths.min > lengths.max) {
      errors.push(`“${field.label}” minimum cannot exceed maximum.`)
    }
  })
  return errors
}
