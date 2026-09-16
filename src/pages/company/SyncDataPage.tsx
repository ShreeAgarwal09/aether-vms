import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { fetchVendorStats } from '@/lib/vendor-api'

export function SyncDataPage() {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [count, setCount] = useState<number | null>(null)

  async function refresh() {
    setPending(true)
    setError(null)
    const { data, error: loadError } = await fetchVendorStats()
    setPending(false)
    if (loadError) {
      setError(loadError.message)
      return
    }
    setCount(data?.length ?? 0)
    setMessage(
      `Local vendor data refreshed at ${new Date().toLocaleTimeString('en-IN')}. Use Integrations for Business Central and Tally.`,
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Data"
        title="Sync data"
        description="Reload vendor records owned by your company from PostgreSQL. Business Central and Tally posting live under Integrations."
      />
      <Card>
        <CardContent className="space-y-4 p-6">
          <p className="text-sm leading-6 text-mist">
            This action reads your vendors through Row Level Security. It does not call Business Central or Tally.
          </p>
          {count !== null ? <p className="text-ivory">{count} vendor records currently visible to this company.</p> : null}
          {message ? <p className="text-sm text-emerald-200">{message}</p> : null}
          {error ? <p className="text-sm text-red-200">{error}</p> : null}
          <Button onClick={() => void refresh()} disabled={pending}>
            {pending ? 'Refreshing…' : 'Refresh local vendor data'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
