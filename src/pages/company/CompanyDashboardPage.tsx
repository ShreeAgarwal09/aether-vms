import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, CheckCircle2, MailPlus, ShieldX, Upload } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { VendorStatusBadge } from '@/components/company/VendorStatusBadge'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { fetchVendorStats } from '@/lib/vendor-api'
import type { Vendor, VendorStatus } from '@/lib/types'

export function CompanyDashboardPage() {
  const { profile } = useAuth()
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    const { data, error: loadError } = await fetchVendorStats()
    if (loadError) {
      setError(loadError.message)
      setVendors([])
    } else {
      setVendors((data ?? []) as Vendor[])
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const counts = {
    total: vendors.length,
    pending: vendors.filter((vendor) => vendor.status === 'pending' || vendor.status === 'invited').length,
    approved: vendors.filter((vendor) => vendor.status === 'approved').length,
    rejected: vendors.filter((vendor) => vendor.status === 'rejected').length,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Company workspace"
        title={profile?.company_name || 'Master dashboard'}
        description={`${profile?.full_name || profile?.email} · signed in as a company user. Vendor records on this dashboard belong only to your company.`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/company/vendors/invite"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-gold px-4 text-sm font-medium text-ink hover:bg-gold-bright"
            >
              Invite vendor
            </Link>
            <Link
              to="/company/vendors"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-line px-4 text-sm text-ivory hover:bg-navy-800"
            >
              View vendors
            </Link>
            <Link
              to="/company/vendors?export=1"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-line px-4 text-sm text-ivory hover:bg-navy-800"
            >
              Export vendors
            </Link>
            <Link
              to="/company/form-builder"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-line px-4 text-sm text-ivory hover:bg-navy-800"
            >
              Form builder
            </Link>
          </div>
        }
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-2xl bg-navy-800/80" />
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-8 text-center">
          <p className="text-ivory">Could not load vendor statistics</p>
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total vendors" value={counts.total} icon={Building2} />
            <StatCard label="Pending / invited" value={counts.pending} icon={MailPlus} />
            <StatCard label="Approved" value={counts.approved} icon={CheckCircle2} />
            <StatCard label="Rejected" value={counts.rejected} icon={ShieldX} />
          </div>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-xl text-ivory">Recent vendor activity</h2>
                <Link to="/company/vendors" className="text-sm text-gold hover:text-gold-bright">
                  View all
                </Link>
              </div>
              {vendors.length === 0 ? (
                <p className="mt-4 text-sm text-mist">
                  No vendors yet. Invite a vendor or upload a bulk Excel file to get started.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-line/70">
                  {vendors.slice(0, 6).map((vendor) => (
                    <li key={vendor.id} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-ivory">{vendor.vendor_name || vendor.email}</p>
                        <p className="text-xs text-mist">{vendor.email}</p>
                      </div>
                      <VendorStatusBadge status={vendor.status as VendorStatus} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-start gap-3 p-6">
              <Upload className="mt-0.5 h-5 w-5 text-gold" />
              <div>
                <h2 className="font-display text-lg text-ivory">Quick actions</h2>
                <p className="mt-2 text-sm leading-6 text-mist">
                  Invite one vendor, import several from Excel, export the directory, or design a vendor form
                  template. Completed submissions appear in Vendor review. Business Central is optional under Integrations.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: typeof Building2
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-mist">{label}</p>
          <p className="mt-2 font-display text-3xl text-ivory">{value}</p>
        </div>
        <Icon className="h-5 w-5 text-gold" />
      </CardContent>
    </Card>
  )
}
