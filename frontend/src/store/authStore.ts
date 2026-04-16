import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface UserInfo {
  id: number
  username: string
  real_name: string
  email: string
  phone: string
  role: 'super_admin' | 'college_admin' | 'staff' | 'student'
  role_display: string
  employee_id: string
  student_id: string
  grade: string
  major: string
  position: string
  is_active: boolean
  theme: 'light' | 'dark'
  language: 'zh-CN' | 'en'
  department_name: string
}

interface AuthState {
  user: UserInfo | null
  isLoggedIn: boolean
  isValidating: boolean
  setUser: (user: UserInfo) => void
  setValidating: (validating: boolean) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoggedIn: false,
      isValidating: false,
      setUser: (user) => set({ user, isLoggedIn: true, isValidating: false }),
      setValidating: (isValidating) => set({ isValidating }),
      logout: () => set({ user: null, isLoggedIn: false }),
    }),
    {
      name: 'auth-storage',
    }
  )
)
