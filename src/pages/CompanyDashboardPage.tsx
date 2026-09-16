import { AppShell } from '@/components/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'

export function CompanyDashboardPage() {
  const { profile } = useAuth()

  return (
    <AppShell eyebrow="Company portal" title="Master dashboard">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-mist">Company</p>
            <p className="mt-2 text-lg text-ivory">{profile?.company_name || 'Not set yet'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-mist">Account</p>
            <p className="mt-2 text-lg text-ivory">{profile?.email}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-mist">Status</p>
            <p className="mt-2 text-lg text-ivory">{profile?.is_active ? 'Active' : 'Inactive'}</p>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardContent className="p-6 sm:p-8">
          <h2 className="font-display text-xl text-ivory">Vendor operations come next</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-mist">
            Vendor lists, invitations, form builder, and review workflows are later phases.
            This protected company route confirms your profile role before any of that work
            is exposed.
          </p>
        </CardContent>
      </Card>
    </AppShell>
  )
}
