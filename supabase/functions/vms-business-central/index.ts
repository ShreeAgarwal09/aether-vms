import { clean, corsHeaders, json, requireCompany, serviceClient } from './shared.ts'
import { disconnect, handleOauthCallback, startOauth } from './oauth.ts'
import { fetchCompanies, getMasterData, selectCompany, testConnection } from './bc-api.ts'
import { syncVendorToBc, validateVendor } from './sync.ts'
import { deleteTemplate, getStatus, getSyncStatus, listTemplates, saveTemplate } from './templates.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const service = serviceClient()
  if (!service) return json({ error: 'Server is missing privileged Supabase configuration.' }, 500)

  if (req.method === 'GET') {
    const url = new URL(req.url)
    if (url.searchParams.get('code') || url.searchParams.get('error')) {
      return json({
        error: 'Complete OAuth from the signed-in company callback page. Direct GET callbacks are not accepted without a company session.',
        code: 'oauth_failed',
      }, 400)
    }
    return json({ error: 'Use POST with an authenticated company session.' }, 405)
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  const authz = await requireCompany(req, service)
  if ('error' in authz && authz.error) return authz.error
  const caller = authz.caller!

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400)
  }
  const action = clean(body.action)
  const vendorId = clean(body.vendorId)

  if (action === 'start_oauth') {
    return startOauth(service, caller.id, body.tenantId, body.environment)
  }
  if (action === 'oauth_callback') return handleOauthCallback(service, caller.id, body.code, body.state)
  if (action === 'get_connection_status' || action === 'get_status') return getStatus(service, caller.id)
  if (action === 'disconnect') return disconnect(service, caller.id)
  if (action === 'test_connection') return testConnection(service, caller.id)
  if (action === 'get_companies') return fetchCompanies(service, caller.id)
  if (action === 'select_company') return selectCompany(service, caller.id, body.bcCompanyId)
  if (action === 'get_master_data') return getMasterData(service, caller.id)
  if (action === 'list_templates') return listTemplates(service, caller.id)
  if (action === 'save_template') return saveTemplate(service, caller.id, body)
  if (action === 'delete_template') return deleteTemplate(service, caller.id, clean(body.id))
  if (action === 'validate_vendor' || action === 'validate_vendor_for_bc') {
    if (!vendorId) return json({ error: 'Vendor id is required.' }, 400)
    return validateVendor(service, caller.id, vendorId)
  }
  if (action === 'sync_vendor' || action === 'create_vendor_in_bc' || action === 'sync_vendor_to_bc' || action === 'retry_bc_sync' || action === 'retry_sync') {
    if (!vendorId) return json({ error: 'Vendor id is required.' }, 400)
    return syncVendorToBc(service, caller.id, vendorId, Boolean(body.approveLocal))
  }
  if (action === 'get_bc_sync_status' || action === 'get_sync_status') {
    if (!vendorId) return json({ error: 'Vendor id is required.' }, 400)
    return getSyncStatus(service, caller.id, vendorId)
  }
  return json({ error: 'Unsupported action.' }, 400)
})
