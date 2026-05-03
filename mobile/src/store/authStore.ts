import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserInfo } from '@/types'
import { getProfile } from '@/api'

interface UIPreferences {
  theme: 'light' | 'dark' | 'auto'
  language: 'zh-CN' | 'en'
}

interface AuthState {
  user: UserInfo | null
  isLoggedIn: boolean
  uiPreferences: UIPreferences
  setUser: (user: UserInfo) => void
  setUIPreferences: (prefs: Partial<UIPreferences>) => void
  refreshProfile: () => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoggedIn: false,
      uiPreferences: { theme: 'auto', language: 'zh-CN' },
      setUser: (user) =>
        set({
          user,
          isLoggedIn: true,
          uiPreferences: { theme: user.theme ?? 'auto', language: user.language ?? 'zh-CN' },
        }),
      setUIPreferences: (prefs) =>
        set((state) => ({ uiPreferences: { ...state.uiPreferences, ...prefs } })),
      refreshProfile: async () => {
        try {
          const res = await getProfile()
          if (res.data?.success) {
            const user = res.data.data
            set({
              user,
              uiPreferences: { theme: user.theme ?? 'auto', language: user.language ?? 'zh-CN' },
            })
          }
        } catch {
          // 静默失败，保留缓存数据
        }
      },
      logout: () => set({ user: null, isLoggedIn: false }),
    }),
    {
      name: 'mobile-auth-storage',
    },
  ),
)
