import React, { useEffect, useMemo, useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider, App as AntApp, Spin } from 'antd'
import enUS from 'antd/locale/en_US'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/en'
import AppRouter from '@/router'
import { useAuthStore } from '@/store/authStore'
import { getProfile } from '@/api/auth'
import { applySeasonToDocument, buildAppTheme, buildSeasonalAppearance } from '@/lib/designSystem'
import { createTranslator } from '@/lib/i18n'
import 'dayjs/locale/zh-cn'

const App: React.FC = () => {
  const { user, uiPreferences, setUser, isLoggedIn, setValidating } = useAuthStore()
  const [initializing, setInitializing] = useState(true)
  const [themeClock, setThemeClock] = useState(() => new Date())

  useEffect(() => {
    const initAuth = async () => {
      if (isLoggedIn && !user) {
        setValidating(true)
        try {
          const res = await getProfile()
          if (res.data.success) {
            setUser(res.data.data)
          } else {
            useAuthStore.getState().logout()
          }
        } catch {
          useAuthStore.getState().logout()
        } finally {
          setValidating(false)
          setInitializing(false)
        }
      } else {
        setInitializing(false)
      }
    }
    initAuth()
  }, [isLoggedIn, setUser, setValidating, user])

  useEffect(() => {
    const timer = window.setInterval(() => setThemeClock(new Date()), 300000)
    return () => window.clearInterval(timer)
  }, [])

  const currentUser = useAuthStore.getState().user || user
  const currentLanguage = currentUser?.language || uiPreferences.language
  const currentThemePreference = currentUser?.theme || uiPreferences.theme
  const systemPrefersDark =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  const resolvedTheme = currentThemePreference === 'auto' ? (systemPrefersDark ? 'dark' : 'light') : currentThemePreference
  const isDark = resolvedTheme === 'dark'
  const locale = currentLanguage === 'en' ? enUS : zhCN
  const appearance = useMemo(() => buildSeasonalAppearance(themeClock), [themeClock])

  useEffect(() => {
    applySeasonToDocument(appearance, isDark)
  }, [appearance, isDark])

  useEffect(() => {
    dayjs.locale(currentLanguage === 'en' ? 'en' : 'zh-cn')
    document.title = createTranslator(currentLanguage)('app.title')
  }, [currentLanguage])

  if (initializing) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F8F9FA',
        }}
      >
        <div
          style={{
            padding: '32px',
            borderRadius: 12,
            background: '#ffffff',
            border: '1px solid #E5E7EB',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04), 0 8px 32px rgba(15, 23, 42, 0.06)',
          }}
        >
          <Spin size="large" />
        </div>
      </div>
    )
  }

  return (
    <ConfigProvider locale={locale} theme={buildAppTheme(isDark, appearance)}>
      <AntApp>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  )
}

export default App
