import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, Mail, Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { formatDateTime, VendorStatusBadge } from '@/components/company/VendorStatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { fetchVendors, PAGE_SIZE, resendVendorInvite, type ListedVendor } from '@/lib/vendor-api'
import type { VendorStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

const filters: Array<'all' | VendorStatus> = ['all', 'invited', 'pending', 'approved', 'rejected', 'blocked']

export function VendorsPage() {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | VendorStatus>('all')
  const [page, setPage] = useState(1)
  const [vendors, setVendors] = useState<ListedVendor[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    const { data, error: loadError, count: nextCount } = await fetchVendors({ query, status, page })
    if (loadError) {
      setError(loadError.message)
      setVendors([])
      setCount(0)
    } else {
      setVendors((data ?? []) as ListedVendor[])
      setCount(nextCount ?? 0)
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [query, status, page])

  useEffect(() => {
    if (params.get('export') === '1') {
      void exportCurrent()
      params.delete('export')
      setParams(params, { replace: true })
    }
    // Initial dashboard deep-link only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const empty = !loading && !error && vendors.length === 0
  const searched = useMemo(() => query.trim().length > 0 || status !== 'all', [query, status])

  async function onResend(id: string) {
    const result = await resendVendorInvite(id)
    setFeedback(result.error ?? result.message ?? 'Invitation processed.')
    await load()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Directory"
        title="Vendors"
        description="Search, filter, and open vendors that belong to your company. Invitation secrets never appear in this list."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void exportCurrent()} disabled={exporting}>
              <Download className="h-4 w-4" />
              Excel export
            </Button>
            <Link
              to="/company/vendors/invite"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gold px-4 text-sm font-medium text-ink hover:bg-gold-bright"
            >
              <Plus className="h-4 w-4" />
              Invite vendor
            </Link>
          </div>
        }
      />

      {feedback ? (
        <div className="rounded-xl border border-line bg-navy-900/80 px-4 py-3 text-sm text-mist">{feedback}</div>
      ) : null}

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" />
              <Input
                className="pl-10"
                placeholder="Search name, email, or phone"
                value={query}
                onChange={(event) => {
                  setPage(1)
                  setQuery(event.target.value)
                }}
              />
            </div>
            <div className="flex flex-wrap rounded-xl border border-line p-1">
              {filters.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setPage(1)
                    setStatus(value)
                  }}
                  className={cn(
                    'rounded-lg px-3 py-2 text-xs uppercase tracking-[0.12em]',
                    status === value ? 'bg-gold text-ink' : 'text-mist',
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-16 animate-pulse rounded-xl bg-navy-800/80" />
              ))}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-8 text-center text-sm text-red-200">
              {error}
            </div>
          ) : null}
          {empty ? (
            <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
              <p className="font-display text-xl text-ivory">
                {searched ? 'No vendors match these filters' : 'No vendors yet'}
              </p>
              <p className="mt-2 text-sm text-mist">
                {searched ? 'Try a different search or status.' : 'Invite a vendor to populate this directory.'}
              </p>
            </div>
          ) : null}

          {!loading && !error && vendors.length > 0 ? (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.14em] text-mist">
                    <tr>
                      <th className="pb-3 font-medium">Vendor</th>
                      <th className="pb-3 font-medium">Email</th>
                      <th className="pb-3 font-medium">Phone</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Invited</th>
                      <th className="pb-3 font-medium">Created</th>
                      <th className="pb-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendors.map((vendor) => (
                      <tr key={vendor.id} className="border-t border-line/70">
                        <td className="py-4 text-ivory">{vendor.vendor_name || '—'}</td>
                        <td className="py-4 text-mist">{vendor.email}</td>
                        <td className="py-4 text-mist">{vendor.vendor_phone_number || '—'}</td>
                        <td className="py-4">
                          <VendorStatusBadge status={vendor.status} />
                        </td>
                        <td className="py-4 text-mist">{formatDateTime(vendor.invited_at)}</td>
                        <td className="py-4 text-mist">{formatDateTime(vendor.created_at)}</td>
                        <td className="py-4">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              to={`/company/vendors/${vendor.id}`}
                              className="inline-flex h-9 items-center rounded-lg border border-line px-3 text-xs text-ivory"
                            >
                              View
                            </Link>
                            <Button size="sm" variant="outline" onClick={() => void onResend(vendor.id)}>
                              <Mail className="h-3.5 w-3.5" />
                              Resend
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 md:hidden">
                {vendors.map((vendor) => (
                  <div key={vendor.id} className="rounded-xl border border-line bg-navy-950/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-ivory">{vendor.vendor_name || '—'}</p>
                        <p className="text-xs text-mist">{vendor.email}</p>
                      </div>
                      <VendorStatusBadge status={vendor.status} />
                    </div>
                    <p className="mt-2 text-sm text-mist">{vendor.vendor_phone_number || 'No phone'}</p>
                    <div className="mt-3 flex gap-2">
                      <Link
                        to={`/company/vendors/${vendor.id}`}
                        className="inline-flex h-9 items-center rounded-lg border border-line px-3 text-xs text-ivory"
                      >
                        View
                      </Link>
                      <Button size="sm" variant="outline" onClick={() => void onResend(vendor.id)}>
                        Resend
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-sm text-mist">
                <p>
                  Page {page} of {pages} · {count} vendors
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )

  async function exportCurrent() {
    setExporting(true)
    const all: ListedVendor[] = []
    let nextPage = 1
    while (true) {
      const { data, error: loadError, count: total } = await fetchVendors({ query, status, page: nextPage })
      if (loadError) {
        setFeedback(loadError.message)
        setExporting(false)
        return
      }
      all.push(...((data ?? []) as ListedVendor[]))
      if (!data?.length || all.length >= (total ?? 0)) break
      nextPage += 1
      if (nextPage > 50) break
    }
    await exportRows(all)
    setExporting(false)
    setFeedback(`Exported ${all.length} vendor${all.length === 1 ? '' : 's'}.`)
  }
}

async function exportRows(rows: ListedVendor[]) {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.json_to_sheet(
    rows.map((vendor) => ({
      'Vendor name': vendor.vendor_name ?? '',
      Email: vendor.email,
      Phone: vendor.vendor_phone_number ?? '',
      Status: vendor.status,
      'Invited at': vendor.invited_at ?? '',
      'Created at': vendor.created_at,
    })),
  )
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Vendors')
  XLSX.writeFile(workbook, 'vendors.xlsx')
}
