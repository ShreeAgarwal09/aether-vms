import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  clean,
  decryptSecret,
  encryptSecret,
  json,
  logSync,
  randomHex,
  sanitizeExternalError,
  sha256Base64Url,
} from './shared.ts'

const BC_SCOPE = 'https://api.businesscentral.dynamics.com/Financials.ReadWrite.All offline_access'

export function oauthConfig() {
  const clientId = Deno.env.get('BC_CLIENT_ID')
  const clientSecret = Deno.env.get('BC_CLIENT_SECRET')
  const redirectUri = Deno.env.get('BC_REDIRECT_URI')
  const defaultTenant = Deno.env.get('BC_TENANT_ID') || 'common'
  if (!clientId || !clientSecret || !redirectUri) {
    return { error: 'Business Central OAuth is not configured on the server.' }
  }
  return { clientId, clientSecret, redirectUri, defaultTenant }
}

export function tenantAuthority(tenant: string) {
  const safe = tenant.replace(/[^a-zA-Z0-9-]/g, '') || 'common'
  return `https://login.microsoftonline.com/${safe}`
}

export async function startOauth(
  service: SupabaseClient,
  callerId: string,
  tenantIdRaw: unknown,
  environmentRaw: unknown,
) {
  const cfg = oauthConfig()
  if ('error' in cfg) return json({ error: cfg.error, code: 'oauth_failed', configured: false }, 503)

  const tenantId = clean(tenantIdRaw) || cfg.defaultTenant
  const environment = clean(environmentRaw) || 'Production'
  const state = randomHex(24)
  const verifier = randomHex(32)
  const challenge = await sha256Base64Url(verifier)
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  await service.from('bc_oauth_states').delete().eq('company_user_id', callerId)
  const { error } = await service.from('bc_oauth_states').insert({
    state,
    company_user_id: callerId,
    code_verifier: verifier,
    tenant_id: tenantId,
    environment,
    expires_at: expires,
  })
  if (error) return json({ error: 'Could not start OAuth.' }, 500)

  await service.from('business_central_connections').upsert({
    company_user_id: callerId,
    tenant_id: tenantId,
    environment,
    connection_status: 'not_connected',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_user_id' })

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    redirect_uri: cfg.redirectUri,
    response_mode: 'query',
    scope: BC_SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  })
  const authorizeUrl = `${tenantAuthority(tenantId)}/oauth2/v2.0/authorize?${params.toString()}`
  return json({ authorizeUrl, configured: true })
}

async function exchangeToken(cfg: { clientId: string; clientSecret: string; redirectUri: string }, tenantId: string, body: URLSearchParams) {
  const response = await fetch(`${tenantAuthority(tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok || !payload.access_token) {
    const mapped = sanitizeExternalError(String(payload.error_description || payload.error || 'Token exchange failed.'), response.status)
    return { error: mapped }
  }
  return {
    access_token: String(payload.access_token),
    refresh_token: payload.refresh_token ? String(payload.refresh_token) : null,
    expires_in: Number(payload.expires_in) || 3600,
    token_type: String(payload.token_type || 'Bearer'),
    scope: payload.scope ? String(payload.scope) : null,
  }
}

export async function handleOauthCallback(
  service: SupabaseClient,
  callerId: string,
  codeRaw: unknown,
  stateRaw: unknown,
) {
  const cfg = oauthConfig()
  if ('error' in cfg) return json({ error: cfg.error, code: 'oauth_failed' }, 503)
  const code = clean(codeRaw)
  const state = clean(stateRaw)
  if (!code || !state) return json({ error: 'Invalid OAuth callback.', code: 'oauth_failed' }, 400)

  const { data: row } = await service.from('bc_oauth_states').select('*').eq('state', state).maybeSingle()
  if (!row || row.company_user_id !== callerId) {
    return json({ error: 'Invalid OAuth state.', code: 'invalid_state' }, 400)
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await service.from('bc_oauth_states').delete().eq('state', state)
    return json({ error: 'OAuth state expired. Start Connect again.', code: 'invalid_state' }, 400)
  }

  const token = await exchangeToken(cfg, row.tenant_id || cfg.defaultTenant, new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: cfg.redirectUri,
    code_verifier: row.code_verifier,
  }))
  await service.from('bc_oauth_states').delete().eq('state', state)
  if ('error' in token) {
    await service.from('business_central_connections').upsert({
      company_user_id: callerId,
      tenant_id: row.tenant_id,
      environment: row.environment,
      connection_status: 'connection_error',
      last_error: token.error.message,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_user_id' })
    await logSync(service, {
      company_user_id: callerId,
      integration_type: 'business_central',
      operation: 'oauth_callback',
      status: 'failed',
      error_code: token.error.code,
      error_message: token.error.message,
    })
    return json({ error: token.error.message, code: token.error.code }, 400)
  }

  await service.from('business_central_tokens').upsert({
    company_user_id: callerId,
    access_token_cipher: await encryptSecret(token.access_token),
    refresh_token_cipher: token.refresh_token ? await encryptSecret(token.refresh_token) : null,
    token_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    token_type: token.token_type,
    scope: token.scope,
    updated_at: new Date().toISOString(),
  })
  await service.from('business_central_connections').upsert({
    company_user_id: callerId,
    tenant_id: row.tenant_id,
    environment: row.environment,
    connection_status: 'connected',
    connected_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_user_id' })
  await logSync(service, {
    company_user_id: callerId,
    integration_type: 'business_central',
    operation: 'oauth_callback',
    status: 'success',
    metadata_safe_json: { environment: row.environment },
  })
  return json({ success: true, message: 'Business Central connected. Select a BC company, then test the connection.' })
}

export async function getAccessToken(service: SupabaseClient, callerId: string) {
  const cfg = oauthConfig()
  if ('error' in cfg) return { error: { code: 'oauth_failed', message: cfg.error } }
  const { data: stored } = await service.from('business_central_tokens').select('*').eq('company_user_id', callerId).maybeSingle()
  if (!stored) return { error: { code: 'oauth_failed', message: 'Business Central is not connected.' } }
  const { data: conn } = await service.from('business_central_connections').select('tenant_id').eq('company_user_id', callerId).maybeSingle()
  const tenant = conn?.tenant_id || cfg.defaultTenant
  const expires = stored.token_expires_at ? new Date(stored.token_expires_at).getTime() : 0
  if (expires - 60_000 > Date.now()) {
    return { token: await decryptSecret(stored.access_token_cipher) }
  }
  if (!stored.refresh_token_cipher) {
    return { error: { code: 'expired_token', message: 'Access token expired and no refresh token is stored. Reconnect.' } }
  }
  const refresh = await decryptSecret(stored.refresh_token_cipher)
  const token = await exchangeToken(cfg, tenant, new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refresh,
    redirect_uri: cfg.redirectUri,
  }))
  if ('error' in token) return { error: token.error }
  await service.from('business_central_tokens').update({
    access_token_cipher: await encryptSecret(token.access_token),
    refresh_token_cipher: token.refresh_token ? await encryptSecret(token.refresh_token) : stored.refresh_token_cipher,
    token_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('company_user_id', callerId)
  return { token: token.access_token }
}

export async function disconnect(service: SupabaseClient, callerId: string) {
  await service.from('business_central_tokens').delete().eq('company_user_id', callerId)
  await service.from('bc_oauth_states').delete().eq('company_user_id', callerId)
  await service.from('business_central_connections').update({
    connection_status: 'not_connected',
    last_error: null,
    bc_company_id: null,
    bc_company_name: null,
    updated_at: new Date().toISOString(),
  }).eq('company_user_id', callerId)
  await logSync(service, {
    company_user_id: callerId,
    integration_type: 'business_central',
    operation: 'disconnect',
    status: 'success',
  })
  return json({ success: true, message: 'Business Central disconnected. Tokens were removed.' })
}
