import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { FullPageSpinner } from '@/components/FullPageSpinner'
import { useAuth } from './AuthProvider'

export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageSpinner />
  if (status === 'signedOut') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}
