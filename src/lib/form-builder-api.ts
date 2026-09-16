import { getSupabase } from '@/lib/supabase'
import { normalizeField, type FormField, type FormTemplate } from '@/lib/form-builder'

const TEMPLATE_COLUMNS =
  'id, company_user_id, name, description, is_active, version, created_at, updated_at'
const FIELD_COLUMNS =
  'id, template_id, field_key, label, field_type, placeholder, help_text, is_required, options, validation_rules, sort_order'

export function fetchTemplates() {
  return getSupabase()
    .from('vendor_form_templates')
    .select(TEMPLATE_COLUMNS)
    .order('updated_at', { ascending: false })
}

export function fetchTemplate(id: string) {
  return getSupabase().from('vendor_form_templates').select(TEMPLATE_COLUMNS).eq('id', id).maybeSingle()
}

export async function fetchFields(templateId: string) {
  const { data, error } = await getSupabase()
    .from('vendor_form_fields')
    .select(FIELD_COLUMNS)
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true })
  if (error) return { data: [] as FormField[], error }
  return { data: (data ?? []).map(normalizeField), error: null }
}

export async function createTemplate(values: { name: string; description: string | null; is_active: boolean }) {
  const inserted = await getSupabase()
    .from('vendor_form_templates')
    .insert({
      name: values.name,
      description: values.description,
      is_active: false,
    })
    .select(TEMPLATE_COLUMNS)
    .single()
  if (inserted.error || !inserted.data) return inserted
  if (!values.is_active) return inserted
  const { error } = await activateTemplate(inserted.data.id)
  if (error) return { data: inserted.data, error }
  return fetchTemplate(inserted.data.id)
}

export function updateTemplate(
  id: string,
  values: Partial<Pick<FormTemplate, 'name' | 'description' | 'is_active' | 'version'>>,
) {
  return getSupabase().from('vendor_form_templates').update(values).eq('id', id).select(TEMPLATE_COLUMNS).single()
}

export function deleteTemplate(id: string) {
  return getSupabase().from('vendor_form_templates').delete().eq('id', id)
}

export function deactivateTemplate(id: string) {
  return getSupabase().from('vendor_form_templates').update({ is_active: false }).eq('id', id)
}

export function activateTemplate(id: string) {
  return getSupabase().rpc('activate_vendor_form_template', { p_id: id })
}

export async function saveTemplateFields(templateId: string, fields: FormField[], version: number) {
  const supabase = getSupabase()
  const { data: existing, error: existingError } = await supabase
    .from('vendor_form_fields')
    .select('id')
    .eq('template_id', templateId)
  if (existingError) return { error: existingError }

  const keep = new Set(fields.map((field) => field.id))
  const removals = (existing ?? []).map((row) => row.id as string).filter((id) => !keep.has(id))
  if (removals.length) {
    const { error: deleteError } = await supabase.from('vendor_form_fields').delete().in('id', removals)
    if (deleteError) return { error: deleteError }
  }

  const rows = fields.map((field, index) => ({
    id: field.id,
    template_id: templateId,
    field_key: field.field_key,
    label: field.label.trim(),
    field_type: field.field_type,
    placeholder: field.placeholder?.trim() || null,
    help_text: field.help_text?.trim() || null,
    is_required: field.is_required,
    options: field.options,
    validation_rules: field.validation_rules,
    sort_order: index,
  }))

  if (rows.length) {
    const { error: upsertError } = await supabase.from('vendor_form_fields').upsert(rows)
    if (upsertError) return { error: upsertError }
  }

  return updateTemplate(templateId, { version: version + 1 })
}
