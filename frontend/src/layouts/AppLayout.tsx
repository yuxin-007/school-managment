import React, { useEffect, useMemo, useState } from 'react'
import { Avatar, Badge, Dropdown, Layout, Menu, Space, Typography, theme as antTheme } from 'antd'
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
import { brandPalette } from '@/lib/designSystem'
import { useAuthStore } from '@/store/authStore'

const { Content, Header, Sider } = Layout
const { Paragraph, Text } = Typography

const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout: clearAuth } = useAuthStore()
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
      ? '全局管理权限'
      : user?.department_name && user.department_name !== user.real_name
        ? user.department_name
        : user?.role_display || '未配置主组织'

  const menuItems = useMemo(() => {
    return [
      { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
      { key: '/announcements', icon: <BellOutlined />, label: '公告中心' },
      { key: '/notifications', icon: <BellOutlined />, label: '消息通知' },
      { key: '/leave', icon: <FileTextOutlined />, label: '请假管理' },
      { key: '/attendance', icon: <ClockCircleOutlined />, label: '考勤打卡' },
      ...(role === 'super_admin' || role === 'college_admin'
        ? [
            { key: '/organization', icon: <ApartmentOutlined />, label: '组织中心' },
            { key: '/announcement-manage', icon: <SolutionOutlined />, label: '公告治理' },
          ]
        : []),
      ...(role === 'super_admin'
        ? [
            { key: '/users', icon: <TeamOutlined />, label: '用户治理' },
            { key: '/logs', icon: <SettingOutlined />, label: '操作日志' },
          ]
        : []),
      ...(role === 'super_admin' || role === 'college_admin'
        ? [{ key: '/attendance-manage', icon: <BarChartOutlined />, label: '考勤看板' }]
        : []),
      ...(role === 'super_admin' || role === 'college_admin' || role === 'staff'
        ? [
            { key: '/courses', icon: <BookOutlined />, label: '课程管理' },
            { key: '/grade-entry', icon: <TrophyOutlined />, label: '成绩录入' },
          ]
        : []),
      ...(role === 'student'
        ? [
            { key: '/course-selection', icon: <BookOutlined />, label: '课程选择' },
            { key: '/course-schedule', icon: <CalendarOutlined />, label: '课表查看' },
            { key: '/my-grades', icon: <TrophyOutlined />, label: '我的成绩' },
          ]
        : []),
      { key: '/settings', icon: <UserOutlined />, label: '个人设置' },
    ]
  }, [role])

  const userMenuItems = [
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '个人设置',
      onClick: () => navigate('/settings'),
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
      onClick: async () => {
        await logout().catch(() => {})
        clearAuth()
        navigate('/login')
      },
    },
  ]

  return (
    <Layout className="app-shell" style={{ minHeight: '100vh', background: token.colorBgLayout }}>
      <Sider
        className="app-sider"
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={248}
        style={{
          background: token.colorBgContainer,
          borderRight: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div
          style={{
            minHeight: 92,
            padding: collapsed ? '18px 12px' : '18px 20px',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              background: `linear-gradient(135deg, ${brandPalette.primary} 0%, ${brandPalette.secondary} 100%)`,
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 700,
            }}
          >
            校
          </div>
          {!collapsed && (
            <Space direction="vertical" size={0}>
              <Text strong style={{ fontSize: 16 }}>
                学校组织与人员平台
              </Text>
              <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
                组织、人员与业务联动中枢
              </Paragraph>
            </Space>
          )}
        </div>

        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ border: 'none', paddingTop: 12 }}
        />
      </Sider>

      <Layout>
        <Header
          className="app-topbar"
          style={{
            padding: '0 24px',
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            position: 'sticky',
            top: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Space size={14}>
            {React.createElement(collapsed ? MenuUnfoldOutlined : MenuFoldOutlined, {
              style: { fontSize: 18, cursor: 'pointer', color: token.colorText },
              onClick: () => setCollapsed((current) => !current),
            })}
            <Space className="app-role-chip" size={8}>
              <Text strong style={{ color: brandPalette.primary }}>
                {user?.role_display || '未识别角色'}
              </Text>
              <Text type="secondary">当前组织：{user?.department_name || '未配置主组织'}</Text>
            </Space>
          </Space>

          <div className="app-header-actions">
            <Badge count={unreadCount} size="small">
              <BellOutlined
                className="app-notification-trigger"
                style={{ fontSize: 18, cursor: 'pointer', color: token.colorText }}
                onClick={() => navigate('/notifications')}
              />
            </Badge>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <div className="app-user-trigger" role="button" tabIndex={0}>
                <Avatar style={{ backgroundColor: token.colorPrimary }} icon={<UserOutlined />} />
                <div className="app-user-meta">
                  <Text strong className="app-user-name">
                    {user?.real_name || '未登录用户'}
                  </Text>
                  <Text type="secondary" className="app-user-subtitle">
                    {userSecondaryLabel}
                  </Text>
                </div>
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content className="app-content" style={{ padding: 24 }}>
          <div className="app-content-wrap">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}

export default AppLayout
