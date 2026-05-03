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
  theme: 'light' | 'dark' | 'auto'
  language: 'zh-CN' | 'en'
  department_name: string
  last_login?: string
  created_at?: string
}

interface UIPreferences {
  theme: 'light' | 'dark' | 'auto'
  language: 'zh-CN' | 'en'
}

interface AuthState {
  user: UserInfo | null
  uiPreferences: UIPreferences
  isLoggedIn: boolean
  isValidating: boolean
  setUser: (user: UserInfo) => void
  setUIPreferences: (preferences: Partial<UIPreferences>) => void
  setValidating: (validating: boolean) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      uiPreferences: {
        theme: 'light',
        language: 'zh-CN',
      },
      isLoggedIn: false,
      isValidating: false,
      setUser: (user) =>
        set({
          user,
          uiPreferences: {
            theme: user.theme || 'light',
            language: user.language || 'zh-CN',
          },
          isLoggedIn: true,
          isValidating: false,
        }),
      setUIPreferences: (preferences) =>
        set((state) => ({
          uiPreferences: {
            ...state.uiPreferences,
            ...preferences,
          },
        })),
      setValidating: (isValidating) => set({ isValidating }),
      logout: () => set((state) => ({ user: null, isLoggedIn: false, uiPreferences: state.uiPreferences })),
    }),
    {
      name: 'auth-storage',
    }
  )
)
