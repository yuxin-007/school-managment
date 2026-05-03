import request from '@/lib/request'
import type {
  AssignmentSubmission,
  AttendanceActivity,
  AttendanceRecord,
  CourseAssignment,
  CourseItem,
  CourseStudent,
  CreateActivityPayload,
  GradeItem,
  LeaveApplication,
  LeaveTypeOption,
  NotificationItem,
  PreferencesState,
  RecoveryContactType,
  RecoveryPurpose,
  ScheduleItem,
  UpdateRecordPayload,
  UserInfo,
} from '@/types'

export const login = (data: { username: string; password: string }) => request.post('/auth/login', data)
export const logout = () => request.get('/auth/logout')
export const getProfile = () => request.get<{ success: boolean; data: UserInfo }>('/user/api/profile')

export const getCourses = () => request.get<{ success: boolean; data: CourseItem[] }>('/course/api/courses')
export const getMySelections = () => request.get('/course/api/courses/my-selections')
export const selectCourse = (courseId: number) => request.post('/course/api/courses/select', { course_id: courseId })
export const dropCourse = (courseId: number) => request.post('/course/api/courses/drop', { course_id: courseId })
export const getSchedule = () => request.get<{ success: boolean; data: ScheduleItem[] }>('/course/api/courses/schedule')
export const getCourseAttendanceActivities = (courseId: number) =>
  request.get<{ success: boolean; data: AttendanceActivity[] }>(`/course/api/courses/${courseId}/attendance-activities`)
export const signInCourseAttendance = (
  activityId: number,
  data: { latitude?: number; longitude?: number; accuracy?: number },
) => request.post(`/course/api/attendance-activities/${activityId}/sign-in`, data)

export const getCourseAssignments = (courseId: number) =>
  request.get<{ success: boolean; data: CourseAssignment[] }>(`/assignment/api/courses/${courseId}/assignments`)
export const submitCourseAssignment = (assignmentId: number, content: string) =>
  request.post(`/assignment/api/assignments/${assignmentId}/submit`, { content })
export const getCourseAssignmentSubmissions = (assignmentId: number) =>
  request.get<{ success: boolean; data: { assignment: CourseAssignment; submissions: AssignmentSubmission[] } }>(
    `/assignment/api/assignments/${assignmentId}/submissions`,
  )
export const reviewCourseAssignmentSubmission = (
  submissionId: number,
  data: { action?: 'review' | 'return'; score?: number; feedback?: string },
) => request.put(`/assignment/api/submissions/${submissionId}/review`, data)

export const getMyGrades = () => request.get<{ success: boolean; data: GradeItem[] }>('/grade/api/grades/my')
export const getLeaveTypes = () => request.get<{ success: boolean; data: LeaveTypeOption[] }>('/leave/api/types')
export const getLeaveApplications = () =>
  request.get<{ success: boolean; data: LeaveApplication[] }>('/leave/api/applications')
export const getPendingLeaveApplications = () =>
  request.get<{ success: boolean; data: LeaveApplication[] }>('/leave/api/applications/pending')
export const createLeaveApplication = (data: {
  leave_type: string
  start_date: string
  end_date: string
  reason: string
  emergency_contact?: string
  emergency_phone?: string
}) => request.post('/leave/api/applications', data)
export const approveLeaveApplication = (applicationId: number, comments: string) =>
  request.post(`/leave/api/applications/${applicationId}/approve`, { comments })
export const rejectLeaveApplication = (applicationId: number, comments: string) =>
  request.post(`/leave/api/applications/${applicationId}/reject`, { comments })
export const cancelLeaveApplication = (applicationId: number) =>
  request.post(`/leave/api/applications/${applicationId}/cancel`)
export const getUnreadCount = () => request.get('/notification/api/notifications/count')
export const getNotifications = () =>
  request.get<{ success: boolean; data: NotificationItem[] }>('/notification/api/notifications', { params: { per_page: 20 } })
export const markNotificationRead = (notificationId: number) =>
  request.post(`/notification/api/notifications/${notificationId}/read`)
export const markAllNotificationsRead = () => request.post('/notification/api/notifications/read-all')

// 教师课堂管理 API
export const getCourseRoster = (courseId: number) =>
  request.get<{ success: boolean; data: CourseStudent[] }>(`/course/api/courses/${courseId}/students`)

export const createCourseAttendanceActivity = (courseId: number, data: CreateActivityPayload) =>
  request.post<{ success: boolean; message: string; data: AttendanceActivity }>(
    `/course/api/courses/${courseId}/attendance-activities`,
    data,
  )

export const closeCourseAttendanceActivity = (activityId: number) =>
  request.post<{ success: boolean; message: string; data: AttendanceActivity }>(
    `/course/api/attendance-activities/${activityId}/close`,
  )

export const getCourseAttendanceRecords = (activityId: number) =>
  request.get<{
    success: boolean
    data: { activity: AttendanceActivity; stats: Record<string, number>; records: AttendanceRecord[] }
  }>(`/course/api/attendance-activities/${activityId}/records`)

export const updateCourseAttendanceStudentRecord = (
  activityId: number,
  studentId: number,
  data: UpdateRecordPayload,
) =>
  request.put<{ success: boolean; message: string; data: AttendanceRecord }>(
    `/course/api/attendance-activities/${activityId}/records/${studentId}`,
    data,
  )

// 成绩录入 API
export const getTeacherCourses = () =>
  request.get<{ success: boolean; data: Array<{ id: number; name: string; code: string; semester: string; grade_count: number }> }>(
    '/grade/api/grades/teacher-courses',
  )

export const getCourseStudentsForGrade = (courseId: number) =>
  request.get<{
    success: boolean
    data: Array<{
      student_id: number
      student_name: string
      student_number: string
      grade_id: number | null
      score: number | null
      grade_letter: string | null
      grade_type: string | null
      is_published: boolean
    }>
  }>(`/grade/api/grades/course/${courseId}/students`)

export const saveGrade = (data: {
  student_id: number
  course_id: number
  score: number
  grade_type?: string
  comment?: string
  is_published?: boolean
}) => request.post<{ success: boolean; message: string; data: Record<string, unknown> }>('/grade/api/grades', data)

export const getGradeStats = () =>
  request.get<{ success: boolean; data: { total: number; published: number; avg_score: number } }>('/grade/api/grades/stats')

// 账号验证中心 API
export const sendRecoveryCode = (data: {
  purpose: RecoveryPurpose
  contact_type: RecoveryContactType
  contact: string
}) => request.post<{ success: boolean; message: string; debug_code?: string }>('/auth/recovery/send-code', data)

export const resetPasswordWithCode = (data: {
  contact_type: RecoveryContactType
  contact: string
  code: string
  new_password: string
  confirm_password: string
}) => request.post<{ success: boolean; message: string }>('/auth/recovery/reset-password', data)

export const loginWithRecoveryCode = (data: {
  contact_type: RecoveryContactType
  contact: string
  code: string
}) => request.post<{ success: boolean; message: string }>('/auth/recovery/login', data)

// 个人信息 API
export const updateProfile = (data: Partial<UserInfo> & { email_code?: string; phone_code?: string }) =>
  request.put<{ success: boolean; message: string }>('/user/api/profile', data)

export const sendContactCode = (data: { contact_type: 'email' | 'phone'; contact: string }) =>
  request.post<{ success: boolean; message: string; debug_code?: string }>('/user/api/contact-code', data)

export const changePassword = (data: {
  current_password: string
  new_password: string
  confirm_password: string
}) => request.post<{ success: boolean; message: string }>('/user/api/change_password', data)

// 偏好设置 API
export const getPreferences = () => request.get<{ success: boolean; data: PreferencesState }>('/user/api/preferences')
export const updatePreferences = (data: Partial<PreferencesState>) =>
  request.put<{ success: boolean; message: string }>('/user/api/preferences', data)
