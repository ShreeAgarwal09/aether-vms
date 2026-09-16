import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DEFAULT_MAPPINGS, json } from './shared.ts'

export async function listTemplates(service: SupabaseClient, callerId: string) {
  const { data } = await service
    .from('business_central_vendor_templates')
    .select('id, name, is_active, field_mappings, created_at, updated_at')
    .eq('company_user_id', callerId)
    .order('created_at', { ascending: false })
  return json({ templates: data ?? [], default_mappings: DEFAULT_MAPPINGS })
}

export async function saveTemplate(
  service: SupabaseClient,
  callerId: string,
  input: { id?: string; name?: string; field_mappings?: unknown; is_active?: boolean; duplicateFrom?: string },
) {
  if (input.duplicateFrom) {
    const { data: source } = await service
      .from('business_central_vendor_templates')
      .select('*')
      .eq('id', input.duplicateFrom)
      .eq('company_user_id', callerId)
      .maybeSingle()
    if (!source) return json({ error: 'Template not found.' }, 404)
    const { data, error } = await service.from('business_central_vendor_templates').insert({
      company_user_id: callerId,
      name: `${source.name} copy`,
      is_active: false,
      field_mappings: source.field_mappings,
    }).select('id, name, is_active, field_mappings').single()
    if (error) return json({ error: error.message }, 400)
    return json({ template: data, message: 'Template duplicated.' })
  }

  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name) return json({ error: 'Template name is required.' }, 400)
  const mappings = Array.isArray(input.field_mappings) ? input.field_mappings : DEFAULT_MAPPINGS
  if (input.id) {
    const { data: existing } = await service
      .from('business_central_vendor_templates')
      .select('id')
      .eq('id', input.id)
      .eq('company_user_id', callerId)
      .maybeSingle()
    if (!existing) return json({ error: 'Template not found.' }, 404)
    if (input.is_active) {
      await service.from('business_central_vendor_templates').update({ is_active: false }).eq('company_user_id', callerId)
    }
    const { error } = await service.from('business_central_vendor_templates').update({
      name,
      field_mappings: mappings,
      is_active: Boolean(input.is_active),
      updated_at: new Date().toISOString(),
    }).eq('id', input.id).eq('company_user_id', callerId)
    if (error) return json({ error: error.message }, 400)
    return json({ success: true, message: 'Template saved.' })
  }
  if (input.is_active) {
    await service.from('business_central_vendor_templates').update({ is_active: false }).eq('company_user_id', callerId)
  }
  const { data, error } = await service.from('business_central_vendor_templates').insert({
    company_user_id: callerId,
    name,
    is_active: Boolean(input.is_active),
    field_mappings: mappings,
  }).select('id').single()
  if (error) return json({ error: error.message }, 400)
  return json({ success: true, id: data.id, message: 'Template created.' })
}

export async function deleteTemplate(service: SupabaseClient, callerId: string, id: string) {
  const { data: existing } = await service
    .from('business_central_vendor_templates')
    .select('id, is_active')
    .eq('id', id)
    .eq('company_user_id', callerId)
    .maybeSingle()
  if (!existing) return json({ error: 'Template not found.' }, 404)
  if (existing.is_active) return json({ error: 'Deactivate the template before deleting it.' }, 400)
  const { error } = await service.from('business_central_vendor_templates').delete().eq('id', id).eq('company_user_id', callerId)
  if (error) return json({ error: error.message }, 400)
  return json({ success: true, message: 'Template deleted.' })
}

export async function getStatus(service: SupabaseClient, callerId: string) {
  const configured = Boolean(Deno.env.get('BC_CLIENT_ID') && Deno.env.get('BC_CLIENT_SECRET') && Deno.env.get('BC_REDIRECT_URI'))
  const { data: conn } = await service.from('business_central_connections').select(
    'tenant_id, environment, bc_company_id, bc_company_name, connection_status, connected_at, last_tested_at, last_error',
  ).eq('company_user_id', callerId).maybeSingle()
  const { count } = await service.from('integration_sync_logs').select('id', { count: 'exact', head: true })
    .eq('company_user_id', callerId).eq('integration_type', 'business_central')
  return json({
    configured,
    missing: configured ? [] : ['BC_CLIENT_ID', 'BC_CLIENT_SECRET', 'BC_REDIRECT_URI'].filter((key) => !Deno.env.get(key)),
    connection: conn ?? {
      connection_status: 'not_connected',
      tenant_id: null,
      environment: 'Production',
      bc_company_id: null,
      bc_company_name: null,
      connected_at: null,
      last_tested_at: null,
      last_error: null,
    },
    logCount: count ?? 0,
  })
}

export async function getSyncStatus(service: SupabaseClient, callerId: string, vendorId: string) {
  const { data: vendor } = await service.from('vendors').select(
    'id, status, bc_sync_status, bc_vendor_id, bc_vendor_number, bc_last_synced_at, bc_last_error, bc_sync_attempts, bc_contact_sync_status, bc_gst_sync_status, bc_bank_sync_status, bc_document_sync_status, tally_sync_status, tally_last_synced_at, tally_last_error, tally_sync_attempts',
  ).eq('id', vendorId).maybeSingle()
  if (!vendor || vendor.company_user_id === undefined) {
    const owned = await service.from('vendors').select('id, company_user_id').eq('id', vendorId).maybeSingle()
    if (!owned.data || owned.data.company_user_id !== callerId) return json({ error: 'Vendor not found.' }, 404)
  }
  const { data: full } = await service.from('vendors').select(
    'id, status, company_user_id, bc_sync_status, bc_vendor_id, bc_vendor_number, bc_last_synced_at, bc_last_error, bc_sync_attempts, bc_contact_sync_status, bc_gst_sync_status, bc_bank_sync_status, bc_document_sync_status, tally_sync_status, tally_last_synced_at, tally_last_error, tally_sync_attempts',
  ).eq('id', vendorId).eq('company_user_id', callerId).maybeSingle()
  if (!full) return json({ error: 'Vendor not found.' }, 404)
  const { data: logs } = await service.from('integration_sync_logs').select(
    'id, integration_type, operation, status, external_id, error_code, error_message, metadata_safe_json, created_at',
  ).eq('vendor_id', vendorId).eq('company_user_id', callerId).order('created_at', { ascending: false }).limit(20)
  return json({ sync: full, logs: logs ?? [] })
}
