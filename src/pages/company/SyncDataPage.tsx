import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { syncBcContacts } from '@/lib/integration-api'
import { fetchVendorStats } from '@/lib/vendor-api'

export function SyncDataPage() {
  const [pending, setPending] = useState(false)
  const [refreshPending, setRefreshPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)

  async function refresh() {
    setRefreshPending(true)
    setError(null)
    const { data, error: loadError } = await fetchVendorStats()
    setRefreshPending(false)
    if (loadError) {
      setError(loadError.message)
      return
    }
    setCount(data?.length ?? 0)
    setMessage(`Local vendor directory refreshed at ${new Date().toLocaleTimeString('en-IN')}.`)
  }

  async function syncFromBc() {
    setPending(true)
    setError(null)
    setMessage(null)
    const result = await syncBcContacts()
    setPending(false)
    if (result.error) {
      setError(String(result.error))
      return
    }
    setLastSync(new Date().toLocaleString('en-IN'))
    setMessage(String(result.message ?? 'Business Central contact sync finished.'))
    await refresh()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Data"
        title="Sync data"
        description="Pull contacts from Business Central and invite new vendor emails automatically. Refresh shows your current vendor directory."
      />
      <Card>
        <CardContent className="space-y-4 p-6">
          <p className="text-sm leading-6 text-mist">
            Sync Data reads contacts from your connected Business Central company. For each email not already in
            VMS, a vendor invitation is created and emailed through Resend with a secure onboarding link.
          </p>
          {count !== null ? (
            <p className="text-ivory">{count} vendor records currently visible to this company.</p>
          ) : null}
          {lastSync ? <p className="text-sm text-mist">Last BC sync: {lastSync}</p> : null}
          {message ? <p className="text-sm text-emerald-200">{message}</p> : null}
          {error ? <p className="text-sm text-red-200">{error}</p> : null}
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void syncFromBc()} disabled={pending}>
              {pending ? 'Syncing from Business Central…' : 'Sync contacts from Business Central'}
            </Button>
            <Button variant="outline" onClick={() => void refresh()} disabled={refreshPending}>
              {refreshPending ? 'Refreshing…' : 'Refresh local vendor data'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
