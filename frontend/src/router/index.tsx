import React, { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Space, Spin, Typography } from 'antd'
import { getProfile } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'

const { Text, Title } = Typography

const AppLayout = lazy(() => import('@/layouts/AppLayout'))
const LoginPage = lazy(() => import('@/pages/Login'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Users = lazy(() => import('@/pages/Users'))
const Organization = lazy(() => import('@/pages/Organization'))
const Leave = lazy(() => import('@/pages/Leave'))
const Courses = lazy(() => import('@/pages/Courses'))
const CourseSelection = lazy(() => import('@/pages/CourseSelection'))
const CourseSchedule = lazy(() => import('@/pages/CourseSchedule'))
const GradeEntry = lazy(() => import('@/pages/GradeEntry'))
const MyGrades = lazy(() => import('@/pages/MyGrades'))
const Attendance = lazy(() => import('@/pages/Attendance'))
const AttendanceManage = lazy(() => import('@/pages/AttendanceManage'))
const Announcements = lazy(() => import('@/pages/Announcements'))
const AnnouncementManage = lazy(() => import('@/pages/AnnouncementManage'))
const Notifications = lazy(() => import('@/pages/Notifications'))
const Logs = lazy(() => import('@/pages/Logs'))
const Settings = lazy(() => import('@/pages/Settings'))

const routeItems = [
  { path: 'dashboard', element: Dashboard },
  { path: 'users', element: Users },
  { path: 'organization', element: Organization },
  { path: 'leave', element: Leave },
  { path: 'courses', element: Courses },
  { path: 'course-selection', element: CourseSelection },
  { path: 'course-schedule', element: CourseSchedule },
  { path: 'grade-entry', element: GradeEntry },
  { path: 'my-grades', element: MyGrades },
  { path: 'attendance', element: Attendance },
  { path: 'attendance-manage', element: AttendanceManage },
  { path: 'announcements', element: Announcements },
  { path: 'announcement-manage', element: AnnouncementManage },
  { path: 'notifications', element: Notifications },
  { path: 'logs', element: Logs },
  { path: 'settings', element: Settings },
]

const PageLoader: React.FC<{ title?: string; description?: string }> = ({
  title = '正在加载页面',
  description = '正在准备与你组织身份匹配的数据与权限。',
}) => (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(180deg, #f7f4ef 0%, #fdfcf9 100%)',
      padding: 24,
    }}
  >
    <Space direction="vertical" size={12} align="center">
      <Spin size="large" />
      <Title level={4} style={{ margin: 0, color: '#2f221c' }}>
        {title}
      </Title>
      <Text type="secondary">{description}</Text>
    </Space>
  </div>
)

const renderLazyPage = (Component: React.LazyExoticComponent<React.FC>) => (
  <Suspense fallback={<PageLoader />}>
    <Component />
  </Suspense>
)

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoggedIn, user, setUser, setValidating, isValidating } = useAuthStore()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const validateAuth = async () => {
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
          setChecking(false)
        }
        return
      }

      setChecking(false)
    }

    validateAuth()
  }, [isLoggedIn, setUser, setValidating, user])

  if (checking || isValidating) {
    return <PageLoader title="正在校验身份" description="正在同步你的登录状态与组织权限。" />
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

const AppRouter: React.FC = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <AppLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          {routeItems.map((route) => (
            <Route key={route.path} path={route.path} element={renderLazyPage(route.element)} />
          ))}
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}

export default AppRouter
