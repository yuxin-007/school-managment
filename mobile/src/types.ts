export type UserRole = 'super_admin' | 'college_admin' | 'staff' | 'student'
export type RecoveryPurpose = 'reset_password' | 'email_login' | 'phone_login'
export type RecoveryContactType = 'email' | 'phone'

export interface UserInfo {
  id: number
  username: string
  real_name: string
  email: string
  phone: string
  role: UserRole
  role_display: string
  employee_id: string
  student_id: string
  grade: string
  major: string
  position: string
  is_active: boolean
  theme: 'light' | 'dark' | 'auto'
  language: 'zh-CN' | 'en'
  department_name: string
}

export interface CourseItem {
  id: number
  name: string
  code: string
  teacher_name?: string
  location?: string
  current_students: number
  max_students: number
  is_active?: boolean
  semester?: string
  schedules?: ScheduleItem[]
}

export interface ScheduleItem {
  course_id: number
  course_name: string
  course_code: string
  teacher_name: string
  location?: string
  day_of_week: number
  day_display: string
  start_time: string
  end_time: string
  time_display: string
}

export interface CourseSelectionRecord {
  course_id?: number
  course?: CourseItem
}

export interface AttendanceActivity {
  id: number
  course_id: number
  title: string
  start_time: string
  end_time: string
  location_name?: string
  status: string
  status_display: string
  my_record?: {
    id: number | null
    status: string
    status_display: string
  } | null
  stats?: {
    total: number
    checked_in: number
    absent: number
  }
}

export interface CourseAssignment {
  id: number
  course_id: number
  title: string
  description: string
  due_time: string
  max_score?: number
  allow_late?: boolean
  status: string
  status_display: string
  my_submission?: {
    id: number | null
    status: string
    status_display: string
    content?: string
    score?: number | null
    feedback?: string
    submitted_at?: string
  } | null
  stats?: {
    total: number
    submitted: number
    reviewed: number
  }
}

export interface AssignmentSubmission {
  id: number | null
  assignment_id: number
  student_id: number
  student_name: string
  student_no: string
  major: string
  grade: string
  email: string
  phone: string
  content: string
  submitted_at: string
  status: string
  status_display: string
  score: number | null
  feedback: string
}

export interface GradeItem {
  id: number
  course_name: string
  course_code: string
  score: number | null
  score_letter: string
  grade_type: string
  comment?: string
  is_published?: boolean
  published_at?: string
}

export interface LeaveTypeOption {
  value: string
  label: string
}

export interface LeaveApplication {
  id: number
  staff_name?: string
  leave_type: string
  leave_type_display: string
  start_date: string
  end_date: string
  total_days: number
  reason: string
  emergency_contact?: string
  emergency_phone?: string
  status: string
  status_display: string
  approver_name?: string
  current_approver_name?: string
  approval_notes?: string
  created_at?: string
}

export interface NotificationItem {
  id: number
  title: string
  content: string
  notification_type: string
  is_read: boolean
  created_at: string
  related_id?: number | null
  related_type?: string
}

export interface CourseStudent {
  id: number
  username: string
  real_name: string
  student_id: string
  major: string
  grade: string
  email: string
  phone: string
  department_name: string
  attendance_total: number
  attendance_present: number
  attendance_absent: number
  attendance_rate: number | null
}

export interface AttendanceRecord {
  id: number | null
  activity_id: number
  student_id: number
  student_name: string
  student_no: string
  major: string
  grade: string
  email: string
  phone: string
  sign_time: string
  status: string
  status_display: string
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  distance_meters: number | null
  within_range: boolean
  remark: string
  reviewed_by: number | null
  reviewed_by_name: string
  reviewed_at: string
  created_at: string
}

export interface CreateActivityPayload {
  title: string
  start_time: string
  end_time: string
  location_name?: string
  latitude: number
  longitude: number
  radius_meters: number
  allow_late?: boolean
}

export interface UpdateRecordPayload {
  status: string
  remark?: string
}

export interface NotificationPreferences {
  leave: boolean
  attendance: boolean
  announcement: boolean
  grade: boolean
  course: boolean
  system: boolean
}

export interface PreferencesState {
  theme: 'light' | 'dark' | 'auto'
  language: 'zh-CN' | 'en'
  notification_preferences: NotificationPreferences
}
