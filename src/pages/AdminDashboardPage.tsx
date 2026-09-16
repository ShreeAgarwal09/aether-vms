import { AppShell } from '@/components/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'

export function AdminDashboardPage() {
  const { profile } = useAuth()

  return (
    <AppShell eyebrow="Admin portal" title="Operations overview">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-mist">Signed in as</p>
            <p className="mt-2 text-lg text-ivory">{profile?.email}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-mist">Role</p>
            <p className="mt-2 text-lg capitalize text-ivory">{profile?.role}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-mist">Workspace</p>
            <p className="mt-2 text-lg text-ivory">Phase 1 foundation</p>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardContent className="p-6 sm:p-8">
          <h2 className="font-display text-xl text-ivory">What this console will do next</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-mist">
            Company user management — add, view, edit, block, delete, and send set-password
            emails — starts in Phase 2. This route is live and reserved for administrators.
          </p>
        </CardContent>
      </Card>
    </AppShell>
  )
}
