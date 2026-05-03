import request from '@/lib/request'

type ApiPayload = Record<string, unknown>
type QueryParams = Record<string, string | number | boolean | undefined>

// 用户管理
export const getUsers = (params?: { page?: number; per_page?: number; has_primary?: string }) =>
  request.get('/user/api/users', { params })
export const getUserOrganizationOptions = (role?: string) =>
  request.get('/user/api/users/organization-options', { params: { role } })

export const getUser = (id: number) => request.get(`/user/api/users/${id}`)

export const createUser = (data: ApiPayload) => request.post('/user/api/users', data)
export const batchUpdatePrimaryOrganization = (data: { user_ids: number[]; primary_node_id?: number | null }) =>
  request.post('/user/api/users/batch-primary-organization', data)

export const updateUser = (id: number, data: ApiPayload) =>
  request.put(`/user/api/users/${id}`, data)

export const deleteUser = (id: number) => request.delete(`/user/api/users/${id}`)

export const searchUsers = (params: { keyword?: string; email?: string; phone?: string; role?: string; has_primary?: string }) =>
  request.get('/user/api/users/search', { params })

export const getUserStatistics = () => request.get('/user/api/statistics/users')

export const exportUsers = (params?: { format?: string; keyword?: string; email?: string; phone?: string; role?: string; has_primary?: string }) =>
  request.get('/user/api/users/export', { params, responseType: 'blob' })

export const importUsers = (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  return request.post('/user/api/users/import', formData)
}

// 组织架构
export const getOrgTree = () => request.get('/organization/api/tree')
export const getOrganizationOverview = () => request.get('/organization/api/overview')
export const createOrgNode = (data: ApiPayload) => request.post('/organization/api/node', data)
export const updateOrgNode = (id: number, data: ApiPayload) =>
  request.put(`/organization/api/node/${id}`, data)
export const deleteOrgNode = (id: number) =>
  request.delete(`/organization/api/node/${id}`)
export const moveOrgNode = (id: number, direction: 'up' | 'down') =>
  request.post(`/organization/api/node/${id}/move`, { direction })
export const getNodeUsers = (nodeId: number) =>
  request.get(`/organization/api/node/${nodeId}/users`)
export const assignUser = (data: { user_id: number; node_id: number; role_in_node?: string; is_primary?: boolean }) =>
  request.post('/organization/api/assign-user', data)
export const batchAssignUsers = (data: { user_ids: number[]; node_id: number; role_in_node?: string; is_primary?: boolean }) =>
  request.post('/organization/api/assign-users/batch', data)
export const removeUser = (userId: number, nodeId: number) =>
  request.delete(`/organization/api/remove-user/${userId}`, { params: { node_id: nodeId } })
export const batchRemoveUsers = (data: { user_ids: number[]; node_id: number }) =>
  request.post('/organization/api/remove-users/batch', data)
export const getUserOptions = (nodeId?: number) =>
  request.get('/organization/api/users/options', { params: { node_id: nodeId } })
export const getAssignableNodeTypes = (parentId?: number) =>
  request.get('/organization/api/assignable-node-types', { params: { parent_id: parentId } })

// 请假管理
export const getLeaveTypes = () => request.get('/leave/api/types', { skipErrorMessage: true })
export const getLeaveApplications = () => request.get('/leave/api/applications', { skipErrorMessage: true })
export const getPendingLeave = () => request.get('/leave/api/applications/pending', { skipErrorMessage: true })
export const createLeave = (data: ApiPayload) => request.post('/leave/api/applications', data, { skipErrorMessage: true })
export const approveLeave = (id: number, data?: { comments?: string }) =>
  request.post(`/leave/api/applications/${id}/approve`, data, { skipErrorMessage: true })
export const rejectLeave = (id: number, data?: { comments?: string }) =>
  request.post(`/leave/api/applications/${id}/reject`, data, { skipErrorMessage: true })
export const cancelLeave = (id: number) =>
  request.post(`/leave/api/applications/${id}/cancel`, null, { skipErrorMessage: true })
export const getLeaveDetail = (id: number) =>
  request.get(`/leave/api/applications/${id}`, { skipErrorMessage: true })
export const getLeaveTransferOptions = (id: number) =>
  request.get(`/leave/api/applications/${id}/transfer-options`, { skipErrorMessage: true })
export const transferLeaveApprover = (
  id: number,
  data: { target_user_id: number; reason?: string }
) => request.post(`/leave/api/applications/${id}/transfer`, data, { skipErrorMessage: true })

// 课程管理
export const getCourses = () => request.get('/course/api/courses')
export const getTeacherOptions = () => request.get('/course/api/teachers/options')
export const getCourse = (id: number) => request.get(`/course/api/courses/${id}`)
export const createCourse = (data: ApiPayload) => request.post('/course/api/courses', data)
export const updateCourse = (id: number, data: ApiPayload) =>
  request.put(`/course/api/courses/${id}`, data)
export const deleteCourse = (id: number) => request.delete(`/course/api/courses/${id}`)
export const selectCourse = (courseId: number) =>
  request.post('/course/api/courses/select', { course_id: courseId })
export const dropCourse = (courseId: number) =>
  request.post('/course/api/courses/drop', { course_id: courseId })
export const getMySelections = () => request.get('/course/api/courses/my-selections')
export const getSchedule = () => request.get('/course/api/courses/schedule')
export const getCourseRoster = (courseId: number) =>
  request.get(`/course/api/courses/${courseId}/students`)
export const getCourseAttendanceActivities = (courseId: number) =>
  request.get(`/course/api/courses/${courseId}/attendance-activities`)
export const createCourseAttendanceActivity = (courseId: number, data: ApiPayload) =>
  request.post(`/course/api/courses/${courseId}/attendance-activities`, data)
export const closeCourseAttendanceActivity = (activityId: number) =>
  request.post(`/course/api/attendance-activities/${activityId}/close`)
export const signInCourseAttendance = (
  activityId: number,
  data: { latitude?: number; longitude?: number; accuracy?: number; remark?: string },
) => request.post(`/course/api/attendance-activities/${activityId}/sign-in`, data)
export const getCourseAttendanceRecords = (activityId: number) =>
  request.get(`/course/api/attendance-activities/${activityId}/records`)
export const exportCourseAttendanceRecords = (activityId: number) =>
  request.get(`/course/api/attendance-activities/${activityId}/records/export`, { responseType: 'blob' })
export const updateCourseAttendanceStudentRecord = (activityId: number, studentId: number, data: ApiPayload) =>
  request.put(`/course/api/attendance-activities/${activityId}/records/${studentId}`, data)

// 成绩管理
export const getCourseAssignments = (courseId: number) =>
  request.get(`/assignment/api/courses/${courseId}/assignments`)
export const createCourseAssignment = (courseId: number, data: ApiPayload) =>
  request.post(`/assignment/api/courses/${courseId}/assignments`, data)
export const uploadCourseAssignmentAttachment = (assignmentId: number, file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  return request.post(`/assignment/api/assignments/${assignmentId}/attachments`, formData)
}
export const submitCourseAssignment = (assignmentId: number, data: { content: string } | FormData) =>
  request.post(`/assignment/api/assignments/${assignmentId}/submit`, data)
export const getCourseAssignmentSubmissions = (assignmentId: number) =>
  request.get(`/assignment/api/assignments/${assignmentId}/submissions`)
export const reviewCourseAssignmentSubmission = (submissionId: number, data: ApiPayload) =>
  request.put(`/assignment/api/submissions/${submissionId}/review`, data)
export const exportCourseAssignmentSubmissions = (assignmentId: number) =>
  request.get(`/assignment/api/assignments/${assignmentId}/submissions/export`, { responseType: 'blob' })

export const getMyGrades = (params?: { page?: number; per_page?: number }) =>
  request.get('/grade/api/grades/my', { params })
export const getTeacherCourses = () => request.get('/grade/api/grades/teacher-courses')
export const getCourseStudents = (courseId: number) =>
  request.get(`/grade/api/grades/course/${courseId}/students`)
export const saveGrade = (data: ApiPayload) => request.post('/grade/api/grades', data)
export const getGradeStats = () => request.get('/grade/api/grades/stats')

// 考勤管理
export const clockIn = (data?: { latitude?: number; longitude?: number; accuracy?: number }) =>
  request.post('/attendance/api/clock-in', data)
export const clockOut = (data?: { latitude?: number; longitude?: number; accuracy?: number }) =>
  request.post('/attendance/api/clock-out', data)
export const getTodayAttendance = () => request.get('/attendance/api/attendance/today')
export const getAllAttendance = (params?: QueryParams) =>
  request.get('/attendance/api/attendance/all', { params })
export const getMyAttendanceSupplements = () => request.get('/attendance/api/supplements/my')
export const getPendingAttendanceSupplements = () => request.get('/attendance/api/supplements/pending')
export const createAttendanceSupplement = (data: {
  attendance_date: string
  supplement_type: 'clock_in' | 'clock_out'
  requested_time: string
  reason: string
}) => request.post('/attendance/api/supplements', data)
export const cancelAttendanceSupplement = (id: number) =>
  request.post(`/attendance/api/supplements/${id}/cancel`)
export const approveAttendanceSupplement = (id: number, data?: { comments?: string }) =>
  request.post(`/attendance/api/supplements/${id}/approve`, data)
export const rejectAttendanceSupplement = (id: number, data: { comments: string }) =>
  request.post(`/attendance/api/supplements/${id}/reject`, data)
export const batchApproveAttendanceSupplements = (data: { request_ids: number[]; comments?: string }) =>
  request.post('/attendance/api/supplements/batch-approve', data)
export const batchRejectAttendanceSupplements = (data: { request_ids: number[]; comments: string }) =>
  request.post('/attendance/api/supplements/batch-reject', data)
export const getAttendanceStats = () => request.get('/attendance/api/attendance/stats')
export const getAttendanceSettings = () => request.get('/attendance/api/settings')
export const updateAttendanceSettings = (data: ApiPayload) => request.put('/attendance/api/settings', data)

// 公告管理
export const getAnnouncements = (params?: QueryParams) =>
  request.get('/announcement/api/announcements', { params })
export const getAllAnnouncements = (params?: QueryParams) =>
  request.get('/announcement/api/announcements/all', { params })
export const getAnnouncementDetail = (id: number, params?: { increment_view?: boolean }) =>
  request.get(`/announcement/api/announcements/${id}`, { params })
export const createAnnouncement = (data: ApiPayload) =>
  request.post('/announcement/api/announcements', data)
export const updateAnnouncement = (id: number, data: ApiPayload) =>
  request.put(`/announcement/api/announcements/${id}`, data)
export const deleteAnnouncement = (id: number) =>
  request.delete(`/announcement/api/announcements/${id}`)

// 通知
export const getNotifications = (params?: QueryParams) =>
  request.get('/notification/api/notifications', { params })
export const getUnreadCount = () => request.get('/notification/api/notifications/count')
export const markAsRead = (id: number) =>
  request.post(`/notification/api/notifications/${id}/read`)
export const markAllAsRead = () => request.post('/notification/api/notifications/read-all')
export const deleteNotification = (id: number) =>
  request.delete(`/notification/api/notifications/${id}`)

// 操作日志
export const getLogs = (params?: QueryParams) => request.get('/log/api/logs', { params })
export const getLogStats = () => request.get('/log/api/logs/stats')
