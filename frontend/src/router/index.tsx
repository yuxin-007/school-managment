import React, { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Space, Spin, Typography } from 'antd'
import { getProfile } from '@/api/auth'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'

const { Text, Title } = Typography

const AppLayout = lazy(() => import('@/layouts/AppLayout'))
const LoginPage = lazy(() => import('@/pages/Login'))
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPassword'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Users = lazy(() => import('@/pages/Users'))
const Organization = lazy(() => import('@/pages/Organization'))
const Leave = lazy(() => import('@/pages/Leave'))
const Courses = lazy(() => import('@/pages/Courses'))
const CourseWorkspace = lazy(() => import('@/pages/CourseWorkspace'))
const CourseAttendance = lazy(() => import('@/pages/CourseAttendance'))
const CourseAssignments = lazy(() => import('@/pages/CourseAssignments'))
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

type Role = 'super_admin' | 'college_admin' | 'staff' | 'student'

const routeItems: Array<{
  path: string
  element: React.LazyExoticComponent<React.FC>
  roles?: Role[]
}> = [
  { path: 'dashboard', element: Dashboard },
  { path: 'users', element: Users, roles: ['super_admin'] },
  { path: 'organization', element: Organization, roles: ['super_admin', 'college_admin'] },
  { path: 'leave', element: Leave },
  { path: 'course-workspace', element: CourseWorkspace, roles: ['super_admin', 'college_admin', 'staff', 'student'] },
  { path: 'courses', element: Courses, roles: ['super_admin', 'college_admin', 'staff'] },
  { path: 'course-attendance', element: CourseAttendance, roles: ['super_admin', 'college_admin', 'staff', 'student'] },
  { path: 'course-assignments', element: CourseAssignments, roles: ['super_admin', 'college_admin', 'staff', 'student'] },
  { path: 'course-selection', element: CourseSelection, roles: ['student'] },
  { path: 'course-schedule', element: CourseSchedule, roles: ['student'] },
  { path: 'grade-entry', element: GradeEntry, roles: ['super_admin', 'college_admin', 'staff'] },
  { path: 'my-grades', element: MyGrades, roles: ['student'] },
  { path: 'attendance', element: Attendance },
  { path: 'attendance-manage', element: AttendanceManage, roles: ['super_admin', 'college_admin'] },
  { path: 'announcements', element: Announcements },
  { path: 'announcement-manage', element: AnnouncementManage, roles: ['super_admin', 'college_admin'] },
  { path: 'notifications', element: Notifications },
  { path: 'logs', element: Logs, roles: ['super_admin'] },
  { path: 'settings', element: Settings },
]

const PageLoader: React.FC<{ title?: string; description?: string }> = ({ title, description }) => {
  const { isEnglish, t } = useI18n()
  const resolvedTitle = title || t('app.loader.page')
  const resolvedDescription = description || t('app.loader.pageDesc')

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(circle at 18% 16%, color-mix(in srgb, var(--brand-secondary) 14%, white) 0%, transparent 24%), radial-gradient(circle at 82% 14%, color-mix(in srgb, var(--brand-accent) 16%, white) 0%, transparent 22%), var(--brand-body-gradient)',
        padding: 24,
      }}
    >
      <Space
        direction="vertical"
        size={12}
        align="center"
        style={{
          padding: '28px 34px',
          borderRadius: 28,
          background: 'var(--brand-card-gradient)',
          border: '1px solid var(--brand-shell-stroke)',
          boxShadow: 'var(--brand-shadow-soft)',
        }}
      >
        <Spin size="large" />
        <Title level={4} style={{ margin: 0, color: 'var(--brand-ink)', fontFamily: isEnglish ? 'var(--font-display-en)' : 'var(--font-display-zh)' }}>
          {resolvedTitle}
        </Title>
        <Text type="secondary" style={{ maxWidth: 280, textAlign: 'center' }}>
          {resolvedDescription}
        </Text>
      </Space>
    </div>
  )
}

const renderLazyPage = (Component: React.LazyExoticComponent<React.FC>) => (
  <Suspense fallback={<PageLoader />}>
    <Component />
  </Suspense>
)

const RoleRoute: React.FC<{ roles?: Role[]; children: React.ReactNode }> = ({ roles, children }) => {
  const user = useAuthStore((state) => state.user)
  if (roles?.length && !roles.includes(user?.role as Role)) {
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoggedIn, user, setUser, setValidating, isValidating } = useAuthStore()
  const { t } = useI18n()
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
    return <PageLoader title={t('app.loader.auth')} description={t('app.loader.authDesc')} />
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
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
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
            <Route
              key={route.path}
              path={route.path}
              element={<RoleRoute roles={route.roles}>{renderLazyPage(route.element)}</RoleRoute>}
            />
          ))}
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}

export default AppRouter
