import React, { useEffect, useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider, App as AntApp, Spin } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import AppRouter from '@/router'
import { useAuthStore } from '@/store/authStore'
import { getProfile } from '@/api/auth'
import { buildAppTheme } from '@/lib/designSystem'
import 'dayjs/locale/zh-cn'

const App: React.FC = () => {
  const { user, setUser, isLoggedIn, setValidating } = useAuthStore()
  const [initializing, setInitializing] = useState(true)
  
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
  }, [])

  const currentUser = useAuthStore.getState().user || user
  const isDark = currentUser?.theme === 'dark'

  if (initializing) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <ConfigProvider locale={zhCN} theme={buildAppTheme(isDark)}>
      <AntApp>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  )
}

export default App
