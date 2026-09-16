import { Link } from 'react-router-dom'
import { ScreenState } from '@/components/ScreenState'
import { useAuth } from '@/contexts/AuthContext'
import { dashboardPathForRole } from '@/lib/routes'

export function UnauthorizedPage() {
  const { profile } = useAuth()
  const home = profile ? dashboardPathForRole(profile.role) : '/login'

  return (
    <ScreenState
      title="Access denied"
      body="This area is limited to a different workspace role. Return to the portal you are allowed to use."
      action={
        <Link
          to={home}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-gold px-4 text-sm font-medium text-ink hover:bg-gold-bright"
        >
          Back to your workspace
        </Link>
      }
    />
  )
}
