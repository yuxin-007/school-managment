import { NavLink, Outlet, useLocation } from 'react-router-dom'
import ErrorBoundary from '@/components/ErrorBoundary'
import { useAuthStore } from '@/store/authStore'
import { isStudent } from '@/lib/permissions'

const getTabsForRole = (role: string | undefined) => {
  const base = [{ path: '/home', icon: 'H', label: '\u9996\u9875' }]

  if (isStudent(role)) {
    return [
      ...base,
      { path: '/courses', icon: 'C', label: '\u9009\u8bfe' },
      { path: '/grades', icon: 'G', label: '\u6210\u7ee9' },
      { path: '/profile', icon: 'M', label: '\u6211\u7684' },
    ]
  }

  return [
    ...base,
    { path: '/courses', icon: 'C', label: '\u8bfe\u7a0b' },
    { path: '/tasks', icon: 'T', label: '\u4e8b\u52a1' },
    { path: '/profile', icon: 'M', label: '\u6211\u7684' },
  ]
}

const AppShell = () => {
  const user = useAuthStore((state) => state.user)
  const tabs = getTabsForRole(user?.role)
  const location = useLocation()

  return (
    <div className="app-frame">
      <header className="app-top">
        <div>
          <span className="eyebrow">Campus App</span>
          <h1>{user?.real_name || '\u79fb\u52a8\u5de5\u4f5c\u53f0'}</h1>
        </div>
        <span className="role-pill">{user?.role_display || user?.role}</span>
      </header>
      <main className="app-main">
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <nav className="bottom-tabs" aria-label="\u79fb\u52a8\u7aef\u4e3b\u5bfc\u822a">
        {tabs.map((tab) => (
          <NavLink key={tab.path} to={tab.path} className={({ isActive }) => `bottom-tab ${isActive ? 'active' : ''}`}>
            <span className="bottom-tab-icon">{tab.icon}</span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default AppShell
