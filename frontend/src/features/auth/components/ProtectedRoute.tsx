import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '../AuthContext'
import type { UserRole } from '../types'

export function ProtectedRoute({ role }: { role: UserRole }) {
  const { session } = useAuth()

  if (!session) {
    return <Navigate to={`/auth?role=${role}&mode=login`} replace />
  }

  if (session.role !== role) {
    return <Navigate to={`/${session.role}/demo`} replace />
  }

  return <Outlet />
}
