import { useEffect, useState, type FormEvent } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { fetchIpConfig, upsertIpConfig } from '@/lib/vendor-api'

export function TallyIpPage() {
  const { profile } = useAuth()
  const [host, setHost] = useState('')
  const [port, setPort] = useState('9000')
  const [enabled, setEnabled] = useState(false)
  const [notes, setNotes] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    fetchIpConfig().then(({ data, error: loadError }) => {
      if (loadError) {
        setError(loadError.message)
        return
      }
      if (data) {
        setHost(data.tally_host ?? '')
        setPort(data.tally_port ? String(data.tally_port) : '')
        setEnabled(Boolean(data.is_enabled))
        setNotes(data.notes ?? '')
      }
    })
  }, [])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) return
    const portNumber = port.trim() ? Number(port) : null
    if (port.trim() && (!Number.isInteger(portNumber) || portNumber! < 1 || portNumber! > 65535)) {
      setError('Port must be between 1 and 65535.')
      return
    }
    setPending(true)
    setError(null)
    const { error: saveError } = await upsertIpConfig({
      company_user_id: profile.id,
      tally_host: host.trim() || null,
      tally_port: portNumber,
      is_enabled: enabled,
      notes: notes.trim() || null,
    })
    setPending(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    setSuccess('Tally IP settings saved. No Tally connection is made in this phase.')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integrations"
        title="Tally IP configuration"
        description="Store the Tally host and port for this company. This does not send XML, open a socket, or post vouchers."
      />
      <Card className="max-w-xl">
        <CardContent className="p-6">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="host">Tally host / IP</Label>
              <Input id="host" value={host} onChange={(event) => setHost(event.target.value)} placeholder="192.168.1.10" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="port">Port</Label>
              <Input id="port" value={port} onChange={(event) => setPort(event.target.value)} placeholder="9000" />
            </div>
            <label className="flex items-center gap-2 text-sm text-mist">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
              />
              Mark as enabled (settings only)
            </label>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>
            {error ? <p className="text-sm text-red-200">{error}</p> : null}
            {success ? <p className="text-sm text-emerald-200">{success}</p> : null}
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save Tally settings'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
