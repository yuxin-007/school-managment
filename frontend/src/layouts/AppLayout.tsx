import React, { useEffect, useMemo, useState } from 'react'
import { Avatar, Badge, Button, Dropdown, Layout, Menu, Typography, theme as antTheme } from 'antd'
import {
  ApartmentOutlined,
  BarChartOutlined,
  BellOutlined,
  BookOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  SolutionOutlined,
  TeamOutlined,
  TrophyOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { logout } from '@/api/auth'
import { getUnreadCount } from '@/api'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'

const { Content, Header, Sider } = Layout
const { Text } = Typography

const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout: clearAuth } = useAuthStore()
  const { isEnglish, roleLabel, t } = useI18n()
  const { token } = antTheme.useToken()

  useEffect(() => {
    const fetchUnread = () => {
      getUnreadCount()
        .then((response) => {
          if (response.data.success) {
            setUnreadCount(response.data.data?.unread || 0)
          }
        })
        .catch(() => {})
    }

    fetchUnread()
    const timer = window.setInterval(fetchUnread, 30000)
    return () => window.clearInterval(timer)
  }, [])

  const role = user?.role
  const userSecondaryLabel =
    role === 'super_admin'
      ? t('layout.globalAccess')
      : user?.department_name && user.department_name !== user.real_name
        ? user.department_name
        : t('common.notConfiguredPrimaryOrg')

  const menuItems = useMemo(() => {
    return [
      { key: '/dashboard', icon: <DashboardOutlined />, label: t('layout.menu.dashboard') },
      { key: '/announcements', icon: <BellOutlined />, label: t('layout.menu.announcements') },
      { key: '/notifications', icon: <BellOutlined />, label: t('layout.menu.notifications') },
      { key: '/leave', icon: <FileTextOutlined />, label: t('layout.menu.leave') },
      { key: '/attendance', icon: <ClockCircleOutlined />, label: t('layout.menu.attendance') },
      ...(role === 'super_admin' || role === 'college_admin'
        ? [
            { key: '/organization', icon: <ApartmentOutlined />, label: t('layout.menu.organization') },
            { key: '/announcement-manage', icon: <SolutionOutlined />, label: t('layout.menu.announcementManage') },
          ]
        : []),
      ...(role === 'super_admin'
        ? [
            { key: '/users', icon: <TeamOutlined />, label: t('layout.menu.users') },
            { key: '/logs', icon: <SettingOutlined />, label: t('layout.menu.logs') },
          ]
        : []),
      ...(role === 'super_admin' || role === 'college_admin'
        ? [{ key: '/attendance-manage', icon: <BarChartOutlined />, label: t('layout.menu.attendanceManage') }]
        : []),
      ...(role === 'super_admin' || role === 'college_admin' || role === 'staff'
        ? [
            { key: '/course-workspace', icon: <BookOutlined />, label: t('layout.menu.courseWorkspace') },
            { key: '/courses', icon: <BookOutlined />, label: t('layout.menu.courses') },
            { key: '/course-attendance', icon: <ClockCircleOutlined />, label: t('layout.menu.courseAttendance') },
            { key: '/course-assignments', icon: <FileTextOutlined />, label: t('layout.menu.courseAssignments') },
            { key: '/grade-entry', icon: <TrophyOutlined />, label: t('layout.menu.gradeEntry') },
          ]
        : []),
      ...(role === 'student'
        ? [
            { key: '/course-workspace', icon: <BookOutlined />, label: t('layout.menu.courseWorkspace') },
            { key: '/course-selection', icon: <BookOutlined />, label: t('layout.menu.courseSelection') },
            { key: '/course-schedule', icon: <CalendarOutlined />, label: t('layout.menu.courseSchedule') },
            { key: '/course-attendance', icon: <ClockCircleOutlined />, label: t('layout.menu.courseAttendance') },
            { key: '/course-assignments', icon: <FileTextOutlined />, label: t('layout.menu.courseAssignments') },
            { key: '/my-grades', icon: <TrophyOutlined />, label: t('layout.menu.myGrades') },
          ]
        : []),
      { key: '/settings', icon: <UserOutlined />, label: t('layout.menu.settings') },
    ]
  }, [role, t])

  const userMenuItems = [
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: t('layout.action.settings'),
      onClick: () => navigate('/settings'),
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: t('layout.action.logout'),
      danger: true,
      onClick: async () => {
        await logout().catch(() => {})
        clearAuth()
        navigate('/login')
      },
    },
  ]

  return (
    <Layout className="app-shell" style={{ minHeight: '100vh', background: '#F8F9FA' }}>
      <Sider
        className="app-sider"
        trigger={null}
        collapsible
        collapsed={collapsed}
        breakpoint="lg"
        collapsedWidth={0}
        onBreakpoint={(broken) => setCollapsed(broken)}
        width={240}
        style={{
          background: '#ffffff',
          borderRight: '1px solid #E5E7EB',
        }}
      >
        <div className="app-brand">
          <div className="app-brand-mark">{'校'}</div>
          {!collapsed && (
            <div className="app-brand-copy">
              <h1 className="app-brand-title">{t('app.title')}</h1>
              <span className="app-brand-subtitle">{isEnglish ? t('app.titleZh') : t('app.titleEn')}</span>
            </div>
          )}
        </div>

        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          aria-label={t('layout.a11y.primaryNavigation')}
          style={{ border: 'none', paddingTop: 8 }}
        />
      </Sider>

      <Layout>
        <Header className="app-topbar">
          <div className="app-topbar-inner">
            <div className="app-topbar-leading">
              <Button
                type="text"
                className="app-toggle-button"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                aria-label={collapsed ? t('layout.a11y.expandNavigation') : t('layout.a11y.collapseNavigation')}
                aria-expanded={!collapsed}
                onClick={() => setCollapsed((current) => !current)}
              />
            </div>

            <div className="app-header-actions">
              <Badge count={unreadCount} size="small" offset={[-2, 2]}>
                <Button
                  type="text"
                  className="app-notification-trigger"
                  icon={<BellOutlined style={{ fontSize: 16 }} />}
                  aria-label={
                    unreadCount > 0
                      ? t('layout.a11y.openNotificationsWithCount', { count: unreadCount })
                      : t('layout.a11y.openNotifications')
                  }
                  onClick={() => navigate('/notifications')}
                />
              </Badge>
              <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
                <button type="button" className="app-user-trigger" aria-label={t('layout.a11y.openUserMenu')} aria-haspopup="menu">
                  <Avatar size={28} style={{ backgroundColor: '#111827', color: '#ffffff', fontSize: 12 }} icon={<UserOutlined />} />
                  <div className="app-user-meta">
                    <Text strong className="app-user-name">
                      {user?.real_name || t('common.loggedOutUser')}
                    </Text>
                    <Text className="app-user-subtitle">
                      {userSecondaryLabel}
                    </Text>
                  </div>
                </button>
              </Dropdown>
            </div>
          </div>
        </Header>

        <Content className="app-content">
          <div className="app-content-wrap">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}

export default AppLayout
