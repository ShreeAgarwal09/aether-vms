import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Ban, Building2, ShieldCheck } from 'lucide-react'
import { AdminPageHeader } from '@/components/AdminLayout'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { fetchCompanyUsers } from '@/lib/admin-api'
import type { CompanyUser } from '@/lib/types'

export function AdminOverviewPage() {
  const [companies, setCompanies] = useState<CompanyUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    const { data, error: loadError } = await fetchCompanyUsers()
    if (loadError) {
      setError(loadError.message)
      setCompanies([])
    } else {
      setCompanies((data ?? []) as CompanyUser[])
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const active = companies.filter((company) => company.is_active).length

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Overview"
        title="Admin dashboard"
        description="Manage every company workspace from one console. Privileged Auth operations run in the vms-admin Edge Function."
        action={
          <Link
            to="/admin/companies"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-gold px-4 text-sm font-medium text-ink hover:bg-gold-bright"
          >
            Open companies
          </Link>
        }
      />
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-16 animate-pulse rounded-xl bg-navy-800/80" />
          ))}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-8 text-center">
          <p className="text-ivory">Could not load company statistics</p>
          <p className="mt-2 text-sm text-red-200">{error}</p>
          <button
            type="button"
            className="mt-5 inline-flex h-11 items-center rounded-lg border border-line px-4 text-sm text-ivory"
            onClick={() => void load()}
          >
            Try again
          </button>
        </div>
      ) : null}
      {!loading && !error ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-mist">Companies</p>
                  <p className="mt-2 font-display text-3xl text-ivory">{companies.length}</p>
                </div>
                <Building2 className="h-5 w-5 text-gold" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-mist">Active</p>
                  <p className="mt-2 font-display text-3xl text-ivory">{active}</p>
                </div>
                <ShieldCheck className="h-5 w-5 text-gold" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-mist">Blocked</p>
                  <p className="mt-2 font-display text-3xl text-ivory">{companies.length - active}</p>
                </div>
                <Ban className="h-5 w-5 text-gold" />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-xl text-ivory">Recent companies</h2>
                <Link to="/admin/companies" className="text-sm text-gold hover:text-gold-bright">
                  View all
                </Link>
              </div>
              {companies.length === 0 ? (
                <p className="mt-4 text-sm text-mist">No company users yet. Create one from the Companies page.</p>
              ) : (
                <ul className="mt-4 divide-y divide-line/70">
                  {companies.slice(0, 5).map((company) => (
                    <li key={company.id} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-ivory">{company.full_name || company.company_name || company.email}</p>
                        <p className="text-xs text-mist">{company.email}</p>
                      </div>
                      <Badge tone={company.is_active ? 'success' : 'danger'}>
                        {company.is_active ? 'Active' : 'Blocked'}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
