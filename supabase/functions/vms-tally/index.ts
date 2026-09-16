import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildCompanyPingXml, buildVendorLedgerXml } from './xml-builder.ts'

// Deferred: this function is not in the active VMS product flow (`enabled = false` in config.toml).
// Keep the source for a later re-enable. The SPA does not invoke vms-tally.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function maskAccount(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return null
  return `${'X'.repeat(Math.max(6, digits.length - 4))}${digits.slice(-4)}`
}

async function requireCompany(req: Request, service: SupabaseClient) {
  const auth = req.headers.get('Authorization')
  if (!auth) return { error: json({ error: 'Authorization required.' }, 401) }
  const { data: { user }, error } = await service.auth.getUser(auth.replace(/^Bearer\s+/i, ''))
  if (error || !user) return { error: json({ error: 'Invalid session.' }, 401) }
  const { data: caller } = await service.from('profiles').select('id, role, is_active').eq('id', user.id).maybeSingle()
  if (!caller || caller.role !== 'company' || !caller.is_active) {
    return { error: json({ error: 'Active company access required.' }, 403) }
  }
  return { caller }
}

async function logSync(service: SupabaseClient, row: Record<string, unknown>) {
  await service.from('integration_sync_logs').insert(row)
}

async function loadConfig(service: SupabaseClient, callerId: string) {
  const { data } = await service.from('ip_configs').select('*').eq('company_user_id', callerId).maybeSingle()
  return data
}

function isBlockedTallyHost(host: string) {
  const trimmed = host.replace(/^https?:\/\//i, '').split('/')[0].split('@').pop() ?? ''
  const hostname = trimmed.split(':')[0].toLowerCase()
  if (!hostname || hostname.length > 253) return true
  if (hostname === '169.254.169.254' || hostname.endsWith('.internal') || hostname === 'metadata.google.internal') {
    return true
  }
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number)
    if (parts[0] === 169 && parts[1] === 254) return true
    if (parts[0] === 0) return true
  }
  return false
}

function tallyUrl(host: string, port: number) {
  const trimmed = host.replace(/\/$/, '')
  if (/^https?:\/\//i.test(trimmed)) return `${trimmed}:${port}`
  return `http://${trimmed}:${port}`
}

async function postXml(host: string, port: number, xml: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(tallyUrl(host, port), {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: xml,
      signal: controller.signal,
    })
    const text = await response.text()
    return { ok: response.ok, status: response.status, text: text.slice(0, 1500) }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed.'
    return { ok: false, status: 0, text: message }
  } finally {
    clearTimeout(timer)
  }
}

function tallyFailed(text: string) {
  return /<LINEERROR>/i.test(text) || /Unknown Request/i.test(text)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return json({ error: 'Server is missing privileged configuration.' }, 500)
  const service = createClient(url, key)
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
  const config = await loadConfig(service, caller.id)

  if (action === 'get_status') {
    return json({
      config: config
        ? {
          tally_host: config.tally_host,
          tally_port: config.tally_port,
          is_enabled: config.is_enabled,
          notes: config.notes,
          tally_company_name: config.tally_company_name,
          last_tested_at: config.last_tested_at,
          last_error: config.last_error,
          last_sync_at: config.last_sync_at,
          connection_status: config.connection_status,
        }
        : null,
    })
  }

  if (action === 'save_config') {
    const host = clean(body.tally_host)
    const port = Number(body.tally_port)
    const enabled = Boolean(body.is_enabled)
    const notes = clean(body.notes) || null
    const companyName = clean(body.tally_company_name) || null
    if (enabled && (!host || !Number.isInteger(port) || port < 1 || port > 65535)) {
      return json({ error: 'Enabled Tally configuration requires a host and a valid port.' }, 400)
    }
    if (host && isBlockedTallyHost(host)) {
      return json({ error: 'That host cannot be used for Tally.' }, 400)
    }
    const row = {
      company_user_id: caller.id,
      tally_host: host || null,
      tally_port: Number.isInteger(port) ? port : null,
      is_enabled: enabled,
      notes,
      tally_company_name: companyName,
      connection_status: enabled ? 'unknown' : 'disabled',
    }
    const { error } = await service.from('ip_configs').upsert(row, { onConflict: 'company_user_id' })
    if (error) return json({ error: 'Could not save Tally settings.' }, 400)
    return json({ success: true, message: 'Tally settings saved. This does not test connectivity.' })
  }

  if (action === 'test_connection' || action === 'test_tally_connection') {
    if (!config?.is_enabled || !config.tally_host || !config.tally_port) {
      return json({ error: 'Enable Tally and save host/port before testing.', code: 'unsupported' }, 400)
    }
    const ping = await postXml(config.tally_host, config.tally_port, buildCompanyPingXml(config.tally_company_name || undefined))
    if (!ping.ok || tallyFailed(ping.text)) {
      await service.from('ip_configs').update({
        connection_status: 'error',
        last_tested_at: new Date().toISOString(),
        last_error: 'Could not reach the Tally endpoint. Cloud hosts cannot access private LAN IPs.',
      }).eq('company_user_id', caller.id)
      await logSync(service, {
        company_user_id: caller.id,
        integration_type: 'tally',
        operation: 'test_connection',
        status: 'failed',
        error_code: 'api_unavailable',
        error_message: 'Could not reach the Tally endpoint.',
      })
        return json({
        error: 'Tally is unreachable. Check that Tally is running and the configured host/port are reachable.',
        code: 'api_unavailable',
      }, 400)
    }
    await service.from('ip_configs').update({
      connection_status: 'connected',
      last_tested_at: new Date().toISOString(),
      last_error: null,
    }).eq('company_user_id', caller.id)
    await logSync(service, {
      company_user_id: caller.id,
      integration_type: 'tally',
      operation: 'test_connection',
      status: 'success',
    })
    return json({ success: true, message: 'Tally endpoint accepted the ping request.' })
  }

  const vendorId = clean(body.vendorId)
  if (action === 'generate_xml' || action === 'generate_vendor_xml' || action === 'sync_vendor' || action === 'sync_vendor_to_tally' || action === 'retry_tally_sync' || action === 'retry_sync') {
    if (!vendorId) return json({ error: 'Vendor id is required.' }, 400)
    const { data: vendor } = await service.from('vendors').select('*').eq('id', vendorId).eq('company_user_id', caller.id).maybeSingle()
    if (!vendor) return json({ error: 'Vendor not found.' }, 404)
    if (vendor.status !== 'approved' && action !== 'generate_xml' && action !== 'generate_vendor_xml') {
      return json({ error: 'Tally posting is available after local approval.' }, 409)
    }
    const { data: contacts } = await service.from('vendor_contact_persons').select('contact_person_name, contact_person_email, contact_person_mobile, is_primary').eq('vendor_id', vendor.id)
    const primary = (contacts ?? []).find((row) => row.is_primary) || contacts?.[0]
    const previewVendor = {
      name: String(vendor.vendor_name || vendor.email),
      mailingName: vendor.legal_name || vendor.vendor_name,
      address: vendor.registered_address || vendor.address_line1,
      city: vendor.city,
      state: vendor.state,
      country: vendor.country || 'India',
      pin: vendor.pincode,
      gstin: vendor.gst_number,
      gstType: vendor.gst_registration_type,
      pan: vendor.pan_card_number ? `${String(vendor.pan_card_number).slice(0, 2)}XXXXXX${String(vendor.pan_card_number).slice(-2)}` : undefined,
      email: vendor.email,
      phone: vendor.vendor_phone_number,
      contact: primary?.contact_person_name,
      bankName: vendor.bank_name,
      ifsc: vendor.vendor_bank_ifsc_code,
      accountNumber: maskAccount(vendor.vendor_account_number) ?? undefined,
      companyName: config?.tally_company_name,
    }
    const xml = buildVendorLedgerXml({
      name: String(vendor.vendor_name || vendor.email),
      mailingName: vendor.legal_name || vendor.vendor_name,
      address: vendor.registered_address || vendor.address_line1,
      city: vendor.city,
      state: vendor.state,
      country: vendor.country || 'India',
      pin: vendor.pincode,
      gstin: vendor.gst_number,
      gstType: vendor.gst_registration_type,
      pan: vendor.pan_card_number,
      email: vendor.email,
      phone: vendor.vendor_phone_number,
      contact: primary?.contact_person_name,
      bankName: vendor.bank_name,
      ifsc: vendor.vendor_bank_ifsc_code,
      accountNumber: vendor.vendor_account_number,
      companyName: config?.tally_company_name,
    })
    if (action === 'generate_xml' || action === 'generate_vendor_xml') {
      return json({
        xml: buildVendorLedgerXml(previewVendor),
        preview: {
          name: vendor.vendor_name,
          gstin: vendor.gst_number,
          pan: previewVendor.pan ?? null,
          account: maskAccount(vendor.vendor_account_number),
        },
      })
    }
    if (!config?.is_enabled || !config.tally_host || !config.tally_port) {
      await service.from('vendors').update({
        tally_sync_status: 'unsupported',
        tally_last_error: 'Tally is not enabled or host/port is missing.',
      }).eq('id', vendor.id)
      return json({ error: 'Tally is not enabled. Save host and port first. Business Central approval is not blocked.', code: 'unsupported' }, 400)
    }
    if (vendor.tally_sync_status === 'synced' && vendor.tally_external_name && !body.force) {
      return json({ error: 'This vendor already posted to Tally. Pass force=true only if you intend a second import.', code: 'duplicate_vendor' }, 409)
    }
    await service.from('vendors').update({
      tally_sync_status: 'syncing',
      tally_sync_attempts: (vendor.tally_sync_attempts || 0) + 1,
    }).eq('id', vendor.id)
    const posted = await postXml(config.tally_host, config.tally_port, xml)
    if (!posted.ok || tallyFailed(posted.text)) {
      const message = posted.ok ? 'Tally returned an import error.' : 'Tally is unreachable. Check that Tally is running and the configured host/port are reachable.'
      await service.from('vendors').update({
        tally_sync_status: 'failed',
        tally_last_error: message,
      }).eq('id', vendor.id)
      await service.from('ip_configs').update({
        last_error: message,
        connection_status: 'error',
      }).eq('company_user_id', caller.id)
      await logSync(service, {
        company_user_id: caller.id,
        vendor_id: vendor.id,
        integration_type: 'tally',
        operation: 'sync_vendor',
        status: 'failed',
        error_code: 'vendor_creation_failed',
        error_message: message,
      })
      return json({ error: message, code: 'vendor_creation_failed' }, 400)
    }
    const now = new Date().toISOString()
    await service.from('vendors').update({
      tally_sync_status: 'synced',
      tally_last_synced_at: now,
      tally_last_error: null,
      tally_external_name: String(vendor.vendor_name || vendor.email),
    }).eq('id', vendor.id)
    await service.from('ip_configs').update({
      last_sync_at: now,
      last_error: null,
      connection_status: 'connected',
    }).eq('company_user_id', caller.id)
    await logSync(service, {
      company_user_id: caller.id,
      vendor_id: vendor.id,
      integration_type: 'tally',
      operation: 'sync_vendor',
      status: 'success',
      external_id: vendor.vendor_name,
      metadata_safe_json: { ledger: 'Sundry Creditors' },
    })
    return json({ success: true, message: 'Tally accepted the ledger import XML.' })
  }

  if (action === 'list_logs') {
    const { data } = await service.from('integration_sync_logs').select(
      'id, vendor_id, operation, status, external_id, error_code, error_message, created_at',
    ).eq('company_user_id', caller.id).eq('integration_type', 'tally').order('created_at', { ascending: false }).limit(50)
    return json({ logs: data ?? [] })
  }

  return json({ error: 'Unsupported action.' }, 400)
})
