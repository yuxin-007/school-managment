import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import RoleRoute from '@/components/RoleRoute'
import UpdateDialog from '@/components/UpdateDialog'
import LoginPage from '@/pages/LoginPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import HomePage from '@/pages/HomePage'
import CoursesPage from '@/pages/CoursesPage'
import TasksPage from '@/pages/TasksPage'
import ProfilePage from '@/pages/ProfilePage'
import CourseDetailPage from '@/pages/CourseDetailPage'
import AssignmentDetailPage from '@/pages/AssignmentDetailPage'
import NotificationsPage from '@/pages/NotificationsPage'
import FreshmanGuidePage from '@/pages/FreshmanGuidePage'
import SchedulePage from '@/pages/SchedulePage'
import GradesPage from '@/pages/GradesPage'
import LeavePage from '@/pages/LeavePage'
import SettingsPage from '@/pages/SettingsPage'
import { useAuthStore } from '@/store/authStore'
import { checkForUpdate, downloadUpdate, type UpdateCheckResult } from '@/lib/appUpdate'

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)
  if (!isLoggedIn) return <Navigate to="/login" replace />
  return <>{children}</>
}

const App = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null)

  useEffect(() => {
    checkForUpdate().then((result) => {
      if (result?.hasUpdate) {
        setUpdateInfo(result)
      }
    })
  }, [])

  return (
    <>
      {updateInfo && (
        <UpdateDialog
          versionName={updateInfo.versionName}
          releaseNotes={updateInfo.releaseNotes}
          isForceUpdate={updateInfo.isForceUpdate}
          onUpdate={() => downloadUpdate(updateInfo.downloadUrl)}
          onSkip={() => setUpdateInfo(null)}
        />
      )}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <AppShell />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="home" element={<HomePage />} />
          <Route path="courses" element={<CoursesPage />} />
          <Route path="courses/:courseId" element={<CourseDetailPage />} />
          <Route path="assignments/:assignmentId" element={<AssignmentDetailPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route
            path="freshman-guide"
            element={
              <RoleRoute roles={['student']}>
                <FreshmanGuidePage />
              </RoleRoute>
            }
          />
          <Route path="schedule" element={<SchedulePage />} />
          <Route
            path="grades"
            element={
              <RoleRoute roles={['student']}>
                <GradesPage />
              </RoleRoute>
            }
          />
          <Route path="leave" element={<LeavePage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default App
