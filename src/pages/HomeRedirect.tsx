import { Navigate } from 'react-router-dom'
import { ScreenState } from '@/components/ScreenState'
import { useAuth } from '@/contexts/AuthContext'
import { dashboardPathForRole } from '@/lib/routes'

export function HomeRedirect() {
  const { loading, session, profile, configured } = useAuth()

  if (!configured) {
    return <Navigate to="/login" replace />
  }

  if (loading) {
    return <ScreenState title="Loading workspace" body="Resolving your session…" loading />
  }

  if (!session || !profile?.is_active) {
    return <Navigate to="/login" replace />
  }

  return <Navigate to={dashboardPathForRole(profile.role)} replace />
}
