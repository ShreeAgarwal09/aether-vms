import type { AppRole } from '@/lib/types'

export function dashboardPathForRole(role: AppRole) {
  return role === 'admin' ? '/admin' : '/company'
}
