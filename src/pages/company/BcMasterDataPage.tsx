import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { invokeBc } from '@/lib/integration-api'

export function BcMasterDataPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [master, setMaster] = useState<Record<string, unknown> | null>(null)

  async function load() {
    setBusy(true)
    setError(null)
    const result = await invokeBc({ action: 'get_master_data' })
    setBusy(false)
    if (result.error) {
      setError(String(result.error))
      setMaster(null)
      return
    }
    setMaster((result.master as Record<string, unknown>) ?? null)
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business Central"
        title="Master data"
        description="Live reads from standard API v2.0: companies, vendors, contacts, and payment terms. Designations, assessee codes, vendor bank accounts, and GST locations are not faked."
        action={
          <Link to="/company/integrations/business-central" className="text-sm text-gold">
            Back
          </Link>
        }
      />
      <Button disabled={busy} onClick={() => void load()}>
        {busy ? 'Loading…' : 'Refresh from Business Central'}
      </Button>
      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
      {master ? (
        <>
          {(['companies', 'vendors', 'contacts', 'paymentTerms'] as const).map((key) => (
            <Card key={key}>
              <CardContent className="space-y-3 p-6">
                <h2 className="font-display text-2xl capitalize text-ivory">{key}</h2>
                {Array.isArray(master[key]) ? (
                  <ul className="space-y-2 text-sm text-mist">
                    {(master[key] as Array<{ id: string; name: string; number?: string }>).slice(0, 30).map((row) => (
                      <li key={row.id}>
                        {row.name}
                        {row.number ? ` · ${row.number}` : ''}
                      </li>
                    ))}
                    {(master[key] as unknown[]).length === 0 ? <li>No rows returned.</li> : null}
                  </ul>
                ) : (
                  <p className="text-sm text-red-200">{JSON.stringify(master[key])}</p>
                )}
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardContent className="space-y-3 p-6">
              <h2 className="font-display text-2xl text-ivory">Not in standard API</h2>
              <ul className="space-y-2 text-sm text-mist">
                {((master.unsupported as Array<{ resource: string; reason: string; note: string }>) ?? []).map((row) => (
                  <li key={row.resource}>
                    <span className="text-ivory">{row.resource}</span> — {row.reason}. {row.note}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
