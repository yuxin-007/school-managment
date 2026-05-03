import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import type { UserRole } from '@/types'

interface RoleRouteProps {
  roles?: UserRole[]
  children: React.ReactNode
}

const RoleRoute: React.FC<RoleRouteProps> = ({ roles, children }) => {
  const user = useAuthStore((state) => state.user)
  if (roles?.length && !roles.includes(user?.role as UserRole)) {
    return <Navigate to="/home" replace />
  }
  return <>{children}</>
}

export default RoleRoute
