import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { AppRole } from '@/lib/types'
import { ScreenState } from '@/components/ScreenState'

type ProtectedRouteProps = {
  allowedRoles: AppRole[]
  children: ReactNode
}

export function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { loading, session, profile, configured, error } = useAuth()
  const location = useLocation()

  if (!configured) {
    return (
      <ScreenState
        title="Configuration required"
        body="Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server."
      />
    )
  }

  if (loading) {
    return <ScreenState title="Restoring session" body="Checking your credentials…" loading />
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!profile) {
    return (
      <ScreenState
        title="Profile unavailable"
        body={error ?? 'Your account exists, but no profile could be loaded. Contact an administrator.'}
      />
    )
  }

  if (!profile.is_active) {
    return (
      <ScreenState
        title="Account disabled"
        body="This workspace access has been deactivated. Contact an administrator."
      />
    )
  }

  if (!allowedRoles.includes(profile.role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return children
}
