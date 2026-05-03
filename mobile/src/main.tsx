import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App as CapApp } from '@capacitor/app'
import App from '@/App'
import { useAuthStore } from '@/store/authStore'
import '@/styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)

CapApp.addListener('appStateChange', ({ isActive }) => {
  if (isActive) {
    const { isLoggedIn, refreshProfile } = useAuthStore.getState()
    if (isLoggedIn) {
      refreshProfile()
    }
  }
})
