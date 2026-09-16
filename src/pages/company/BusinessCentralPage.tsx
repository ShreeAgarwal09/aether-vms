import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { invokeBc } from '@/lib/integration-api'
import { getSupabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type Connection = {
  tenant_id: string | null
  environment: string
  bc_company_id: string | null
  bc_company_name: string | null
  connection_status: 'not_connected' | 'connected' | 'connection_error'
  connected_at: string | null
  last_tested_at: string | null
  last_error: string | null
}

const statusLabel: Record<Connection['connection_status'], string> = {
  not_connected: 'Not Connected',
  connected: 'Connected',
  connection_error: 'Connection Error',
}

export function BusinessCentralPage() {
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(false)
  const [connection, setConnection] = useState<Connection | null>(null)
  const [tenantId, setTenantId] = useState('')
  const [environment, setEnvironment] = useState('Production')
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const [logs, setLogs] = useState<Array<Record<string, string>>>([])

  async function load() {
    setLoading(true)
    const result = await invokeBc({ action: 'get_connection_status' })
    setConfigured(Boolean(result.configured))
    const conn = result.connection as Connection
    setConnection(conn)
    if (conn?.tenant_id) setTenantId(conn.tenant_id)
    if (conn?.environment) setEnvironment(conn.environment)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  async function connect() {
    setBusy(true)
    setError(null)
    const result = await invokeBc({ action: 'start_oauth', tenantId, environment })
    setBusy(false)
    if (result.error || !result.authorizeUrl) {
      setError(String(result.error || 'Could not start OAuth.'))
      return
    }
    window.location.assign(String(result.authorizeUrl))
  }

  async function test() {
    setBusy(true)
    const result = await invokeBc({ action: 'test_connection' })
    setBusy(false)
    if (result.error) setError(String(result.error))
    else setNotice(String(result.message || 'Connection succeeded.'))
    await load()
  }

  async function loadCompanies() {
    setBusy(true)
    const result = await invokeBc({ action: 'get_companies' })
    setBusy(false)
    if (result.error) {
      setError(String(result.error))
      return
    }
    setCompanies((result.companies as Array<{ id: string; name: string }>) ?? [])
  }

  async function chooseCompany(id: string) {
    setBusy(true)
    const result = await invokeBc({ action: 'select_company', bcCompanyId: id })
    setBusy(false)
    if (result.error) setError(String(result.error))
    else setNotice(`Selected ${String(result.bc_company_name)}.`)
    await load()
  }

  async function disconnect() {
    setBusy(true)
    const result = await invokeBc({ action: 'disconnect' })
    setBusy(false)
    setDisconnectOpen(false)
    if (result.error) setError(String(result.error))
    else setNotice(String(result.message))
    await load()
  }

  const status = connection?.connection_status || 'not_connected'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integrations"
        title="Business Central"
        description="OAuth tokens never leave the server. Connect with Microsoft Entra, choose a BC company, then sync approved vendors through Edge Functions."
      />
      {loading ? <div className="h-40 animate-pulse rounded-2xl bg-navy-800/80" /> : null}
      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-line px-4 py-3 text-sm text-mist">{notice}</div> : null}

      {!configured ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-ivory">Configuration required</p>
            <p className="text-sm leading-6 text-mist">
              Microsoft application credentials are not configured on the Edge Functions. Connect will stay disabled until an administrator sets the server secrets. This page will not pretend the connection succeeded.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-mist">Status</p>
              <p className={cn('mt-1 text-lg text-ivory', status === 'connection_error' && 'text-red-300')}>
                {statusLabel[status]}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || !configured} onClick={() => void connect()}>
                {busy ? 'Working…' : 'Connect to Business Central'}
              </Button>
              <Button variant="outline" disabled={busy || status === 'not_connected'} onClick={() => void test()}>
                {busy ? 'Working…' : 'Test connection'}
              </Button>
              <Button variant="outline" disabled={busy || status === 'not_connected'} onClick={() => setDisconnectOpen(true)}>
                Disconnect
              </Button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tenant">Tenant ID</Label>
              <Input id="tenant" value={tenantId} onChange={(event) => setTenantId(event.target.value)} placeholder="Directory (tenant) ID or common" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="env">Environment</Label>
              <Input id="env" value={environment} onChange={(event) => setEnvironment(event.target.value)} placeholder="Production or sandbox name" />
            </div>
          </div>
          <p className="text-sm text-mist">BC company: {connection?.bc_company_name || 'Not selected'}</p>
          <p className="text-sm text-mist">Last successful connection: {connection?.connected_at || '—'}</p>
          <p className="text-sm text-mist">Last test: {connection?.last_tested_at || '—'}</p>
          {connection?.last_error ? <p className="text-sm text-red-200">{connection.last_error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy || status === 'not_connected'} onClick={() => void loadCompanies()}>
              Load BC companies
            </Button>
            <Link to="/company/integrations/business-central/master-data" className="inline-flex h-11 items-center rounded-lg border border-line px-4 text-sm text-ivory">
              Master data
            </Link>
            <Link to="/company/integrations/business-central/vendor-templates" className="inline-flex h-11 items-center rounded-lg border border-line px-4 text-sm text-ivory">
              Vendor templates
            </Link>
          </div>
          {companies.length ? (
            <ul className="space-y-2">
              {companies.map((company) => (
                <li key={company.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
                  <span className="text-ivory">{company.name}</span>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void chooseCompany(company.id)}>
                    Use this company
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-mist">Companies appear here after a successful connection.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl text-ivory">Sync logs</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const result = await invokeBc({ action: 'get_connection_status' })
                void result
                const { data } = await getSupabase()
                  .from('integration_sync_logs')
                  .select('id, operation, status, error_code, error_message, created_at')
                  .eq('integration_type', 'business_central')
                  .order('created_at', { ascending: false })
                  .limit(20)
                setLogs((data as Array<Record<string, string>>) ?? [])
              }}
            >
              Refresh logs
            </Button>
          </div>
          {logs.length ? (
            <ul className="space-y-2 text-sm">
              {logs.map((log) => (
                <li key={log.id} className="rounded-xl border border-line px-4 py-3 text-mist">
                  {log.created_at} · {log.operation} · {log.status}
                  {log.error_message ? ` · ${log.error_message}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-mist">No logs loaded. Tokens and secrets are never stored in logs.</p>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={disconnectOpen}
        title="Disconnect Business Central?"
        description="Stored refresh and access tokens will be deleted on the server. Local vendor records stay in VMS."
        confirmLabel="Disconnect"
        danger
        pending={busy}
        onClose={() => setDisconnectOpen(false)}
        onConfirm={() => void disconnect()}
      />
    </div>
  )
}
