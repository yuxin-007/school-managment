import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

export const useAuthCheck = () => {
  const navigate = useNavigate()
  const { isLoggedIn, user } = useAuthStore()

  useEffect(() => {
    if (!isLoggedIn) {
      navigate('/login')
    }
  }, [isLoggedIn, navigate])

  return { isLoggedIn, user }
}

export const useAuth = () => {
  const navigate = useNavigate()
  const { isLoggedIn, user, setUser, logout: clearAuth } = useAuthStore()

  const logout = async (apiLogout: () => Promise<any>) => {
    try {
      await apiLogout()
    } catch {}
    clearAuth()
    navigate('/login')
  }

  return { isLoggedIn, user, setUser, logout }
}