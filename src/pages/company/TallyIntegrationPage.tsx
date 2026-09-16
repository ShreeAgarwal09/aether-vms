import { useEffect, useState, type FormEvent } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { invokeTally } from '@/lib/integration-api'

export function TallyIntegrationPage() {
  const [host, setHost] = useState('')
  const [port, setPort] = useState('9000')
  const [enabled, setEnabled] = useState(false)
  const [notes, setNotes] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [status, setStatus] = useState('unknown')
  const [lastTest, setLastTest] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [xml, setXml] = useState<string | null>(null)
  const [vendorId, setVendorId] = useState('')
  const [logs, setLogs] = useState<Array<Record<string, string>>>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function load() {
    const result = await invokeTally({ action: 'get_status' })
    const config = result.config as Record<string, unknown> | null
    if (config) {
      setHost(String(config.tally_host ?? ''))
      setPort(config.tally_port ? String(config.tally_port) : '9000')
      setEnabled(Boolean(config.is_enabled))
      setNotes(String(config.notes ?? ''))
      setCompanyName(String(config.tally_company_name ?? ''))
      setStatus(String(config.connection_status ?? 'unknown'))
      setLastTest(config.last_tested_at ? String(config.last_tested_at) : null)
      setLastSync(config.last_sync_at ? String(config.last_sync_at) : null)
      setLastError(config.last_error ? String(config.last_error) : null)
    }
    const logResult = await invokeTally({ action: 'list_logs' })
    setLogs((logResult.logs as Array<Record<string, string>>) ?? [])
  }

  useEffect(() => {
    void load()
  }, [])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const result = await invokeTally({
      action: 'save_config',
      tally_host: host,
      tally_port: Number(port),
      is_enabled: enabled,
      notes,
      tally_company_name: companyName,
    })
    setPending(false)
    if (result.error) setError(String(result.error))
    else setSuccess(String(result.message))
    await load()
  }

  async function test() {
    setPending(true)
    const result = await invokeTally({ action: 'test_tally_connection' })
    setPending(false)
    if (result.error) setError(String(result.error))
    else setSuccess(String(result.message))
    await load()
  }

  async function previewXml() {
    if (!vendorId) {
      setError('Enter an approved vendor id to preview XML.')
      return
    }
    setPending(true)
    const result = await invokeTally({ action: 'generate_vendor_xml', vendorId })
    setPending(false)
    if (result.error) {
      setError(String(result.error))
      setXml(null)
      return
    }
    setXml(String(result.xml || ''))
  }

  function downloadXml() {
    if (!xml) return
    const blob = new Blob([xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'tally-vendor.xml'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integrations"
        title="Tally"
        description="Generate Tally XML on the server and POST it to the configured HTTP listener. Hosted Edge Functions cannot reach private LAN IPs; a failed test is reported honestly."
      />
      <Card className="max-w-xl">
        <CardContent className="p-6">
          <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
            <p className="text-sm text-mist">Status: {enabled ? status : 'Disabled'}</p>
            <div className="space-y-2">
              <Label htmlFor="host">Tally host / IP</Label>
              <Input id="host" value={host} onChange={(event) => setHost(event.target.value)} placeholder="192.168.1.10" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="port">Port</Label>
              <Input id="port" value={port} onChange={(event) => setPort(event.target.value)} placeholder="9000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">Tally company name</Label>
              <Input id="company" value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm text-mist">
              <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
              Enabled
            </label>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>
            {lastTest ? <p className="text-xs text-mist">Last test: {lastTest}</p> : null}
            {lastSync ? <p className="text-xs text-mist">Last sync: {lastSync}</p> : null}
            {lastError ? <p className="text-sm text-red-200">{lastError}</p> : null}
            {error ? <p className="text-sm text-red-200">{error}</p> : null}
            {success ? <p className="text-sm text-emerald-200">{success}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Save Tally settings'}
              </Button>
              <Button type="button" variant="outline" disabled={pending} onClick={() => void test()}>
                Test connection
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <h2 className="font-display text-2xl text-ivory">XML preview</h2>
          <Label htmlFor="vendor-id">Vendor ID</Label>
          <Input id="vendor-id" value={vendorId} onChange={(event) => setVendorId(event.target.value)} placeholder="Approved vendor UUID" />
          <div className="flex gap-2">
            <Button variant="outline" disabled={pending} onClick={() => void previewXml()}>
              Generate XML
            </Button>
            <Button variant="outline" disabled={!xml} onClick={downloadXml}>
              Download XML
            </Button>
          </div>
          {xml ? (
            <pre className="max-h-80 overflow-auto rounded-xl border border-line bg-navy-950 p-4 text-xs text-mist">{xml}</pre>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h2 className="font-display text-2xl text-ivory">Sync logs</h2>
          {logs.length ? (
            <ul className="space-y-2 text-sm text-mist">
              {logs.map((log) => (
                <li key={log.id}>
                  {log.created_at} · {log.operation} · {log.status}
                  {log.error_message ? ` · ${log.error_message}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-mist">No Tally logs yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
