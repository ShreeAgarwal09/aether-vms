import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { json, logSync, sanitizeExternalError } from './shared.ts'
import { getAccessToken } from './oauth.ts'

export function apiRoot(tenantId: string | null, environment: string) {
  const env = encodeURIComponent(environment || 'Production')
  const tenant = (tenantId || '').replace(/[^a-zA-Z0-9-]/g, '')
  if (tenant && tenant !== 'common') {
    return `https://api.businesscentral.dynamics.com/v2.0/${tenant}/${env}/api/v2.0`
  }
  return `https://api.businesscentral.dynamics.com/v2.0/${env}/api/v2.0`
}

export async function bcFetch(
  token: string,
  url: string,
  init: RequestInit = {},
) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { raw: text.slice(0, 200) }
  }
  return { response, body, text }
}

export async function connectionContext(service: SupabaseClient, callerId: string) {
  const token = await getAccessToken(service, callerId)
  if ('error' in token) return { error: token.error }
  const { data: conn } = await service.from('business_central_connections').select('*').eq('company_user_id', callerId).maybeSingle()
  if (!conn) return { error: { code: 'oauth_failed', message: 'Business Central is not connected.' } }
  return { token: token.token, conn, root: apiRoot(conn.tenant_id, conn.environment) }
}

export function companyUrl(root: string, companyId: string, path: string) {
  return `${root}/companies(${companyId})${path}`
}

export async function fetchCompanies(service: SupabaseClient, callerId: string) {
  const ctx = await connectionContext(service, callerId)
  if ('error' in ctx) return json({ error: ctx.error.message, code: ctx.error.code }, 400)
  const { response, body } = await bcFetch(ctx.token, `${ctx.root}/companies`)
  if (!response.ok) {
    const mapped = sanitizeExternalError(JSON.stringify(body).slice(0, 300), response.status)
    await service.from('business_central_connections').update({
      connection_status: 'connection_error',
      last_error: mapped.message,
      updated_at: new Date().toISOString(),
    }).eq('company_user_id', callerId)
    return json({ error: mapped.message, code: mapped.code }, response.status === 401 ? 401 : 400)
  }
  const values = Array.isArray((body as { value?: unknown[] }).value) ? (body as { value: Array<Record<string, unknown>> }).value : []
  const companies = values.map((row) => ({
    id: String(row.id),
    name: String(row.name || row.displayName || 'Unnamed company'),
  }))
  await service.from('bc_master_cache').delete().eq('company_user_id', callerId).eq('resource_type', 'companies')
  if (companies.length) {
    await service.from('bc_master_cache').insert(
      companies.map((row) => ({
        company_user_id: callerId,
        resource_type: 'companies',
        external_id: row.id,
        display_name: row.name,
        payload_safe: { id: row.id, name: row.name },
      })),
    )
  }
  await service.from('business_central_connections').update({
    connection_status: 'connected',
    last_tested_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq('company_user_id', callerId)
  return json({ companies })
}

export async function selectCompany(service: SupabaseClient, callerId: string, companyIdRaw: unknown) {
  const companyId = String(companyIdRaw || '').trim()
  if (!companyId) return json({ error: 'Select a Business Central company.' }, 400)
  const listed = await fetchCompanies(service, callerId)
  const payload = await listed.clone().json() as { companies?: Array<{ id: string; name: string }>; error?: string }
  if (payload.error) return listed
  const match = (payload.companies ?? []).find((row) => row.id === companyId)
  if (!match) return json({ error: 'Company not found in this Business Central environment.', code: 'company_not_found' }, 404)
  await service.from('business_central_connections').update({
    bc_company_id: match.id,
    bc_company_name: match.name,
    updated_at: new Date().toISOString(),
  }).eq('company_user_id', callerId)
  return json({ success: true, bc_company_id: match.id, bc_company_name: match.name })
}

export async function testConnection(service: SupabaseClient, callerId: string) {
  const ctx = await connectionContext(service, callerId)
  if ('error' in ctx) return json({ error: ctx.error.message, code: ctx.error.code, configured: true }, 400)
  const { response, body } = await bcFetch(ctx.token, `${ctx.root}/companies`)
  if (!response.ok) {
    const mapped = sanitizeExternalError(JSON.stringify(body).slice(0, 300), response.status)
    await service.from('business_central_connections').update({
      connection_status: 'connection_error',
      last_error: mapped.message,
      last_tested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('company_user_id', callerId)
    await logSync(service, {
      company_user_id: callerId,
      integration_type: 'business_central',
      operation: 'test_connection',
      status: 'failed',
      error_code: mapped.code,
      error_message: mapped.message,
    })
    return json({ error: mapped.message, code: mapped.code }, 400)
  }
  await service.from('business_central_connections').update({
    connection_status: 'connected',
    last_tested_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq('company_user_id', callerId)
  await logSync(service, {
    company_user_id: callerId,
    integration_type: 'business_central',
    operation: 'test_connection',
    status: 'success',
  })
  return json({ success: true, message: 'Connection succeeded. Companies endpoint responded.' })
}

export async function getMasterData(service: SupabaseClient, callerId: string) {
  const ctx = await connectionContext(service, callerId)
  if ('error' in ctx) return json({ error: ctx.error.message, code: ctx.error.code }, 400)
  if (!ctx.conn.bc_company_id) {
    return json({ error: 'Select a Business Central company first.', code: 'company_not_found' }, 400)
  }
  const companyId = ctx.conn.bc_company_id
  const resources = [
    { type: 'vendors', path: '/vendors?$top=50&$select=id,number,displayName,email' },
    { type: 'contacts', path: '/contacts?$top=50&$select=id,number,displayName,email,type' },
    { type: 'paymentTerms', path: '/paymentTerms?$top=50&$select=id,code,displayName' },
  ]
  const result: Record<string, unknown> = {
    companies: [],
    vendors: [],
    contacts: [],
    paymentTerms: [],
    unsupported: [
      { resource: 'designations', reason: 'not available in standard API', note: 'Contact.jobTitle is not on the v2.0 contact resource. Use local designations or a BC extension.' },
      { resource: 'assessee_codes', reason: 'not available in standard API', note: 'Indian assessee codes are not a standard vendor field.' },
      { resource: 'vendorBankAccounts', reason: 'custom API required', note: 'Standard bankAccounts is the company bank book, not vendor remittance accounts.' },
      { resource: 'gstLocations', reason: 'not available in standard API', note: 'Only taxRegistrationNumber exists on vendor.' },
    ],
  }
  const { data: cachedCompanies } = await service.from('bc_master_cache').select('external_id, display_name').eq('company_user_id', callerId).eq('resource_type', 'companies')
  result.companies = (cachedCompanies ?? []).map((row) => ({ id: row.external_id, name: row.display_name }))

  for (const resource of resources) {
    const { response, body } = await bcFetch(ctx.token, companyUrl(ctx.root, companyId, resource.path))
    if (!response.ok) {
      const mapped = sanitizeExternalError(JSON.stringify(body).slice(0, 200), response.status)
      result[resource.type] = { error: mapped.message, code: mapped.code }
      continue
    }
    const values = Array.isArray((body as { value?: unknown[] }).value) ? (body as { value: Array<Record<string, unknown>> }).value : []
    const rows = values.map((row) => ({
      id: String(row.id || ''),
      number: row.number ? String(row.number) : null,
      name: String(row.displayName || row.code || row.name || ''),
      email: row.email ? String(row.email) : null,
      type: row.type ? String(row.type) : null,
      code: row.code ? String(row.code) : null,
    }))
    result[resource.type] = rows
    await service.from('bc_master_cache').delete().eq('company_user_id', callerId).eq('resource_type', resource.type)
    if (rows.length) {
      await service.from('bc_master_cache').insert(
        rows.map((row) => ({
          company_user_id: callerId,
          resource_type: resource.type,
          external_id: row.id,
          display_name: row.name,
          payload_safe: row,
        })),
      )
    }
  }
  return json({ master: result, fetched_at: new Date().toISOString() })
}

export { companyUrl }
