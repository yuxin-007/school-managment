/**
 * 课堂管理纯函数
 * 处理教师端课堂管理相关的状态判断和计算逻辑
 */

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'leave' | 'location_abnormal' | 'manual'

export interface StudentAttendanceStats {
  total: number
  present: number
  late: number
  absent: number
  manual: number
  attendance_rate: number | null
}

export interface ActivityOperationalState {
  canClose: boolean
  canViewRecords: boolean
  canManageRecords: boolean
  statusLabel: string
  statusType: 'active' | 'ended' | 'pending'
}

/**
 * 判断用户是否可以管理课程（教师、学院管理员、超级管理员）
 */
export function canManageCourse(userRole: string): boolean {
  return ['staff', 'college_admin', 'super_admin'].includes(userRole)
}

/**
 * 计算学生出勤率
 */
export function calculateAttendanceRate(stats: StudentAttendanceStats): number | null {
  if (stats.total === 0) return null
  const attended = stats.present + stats.late + stats.manual
  return Math.round((attended / stats.total) * 100 * 10) / 10
}

/**
 * 获取签到状态显示文本
 */
export function getAttendanceStatusText(status: AttendanceStatus): string {
  const statusMap: Record<AttendanceStatus, string> = {
    present: '已签到',
    late: '迟到',
    absent: '未签到',
    leave: '请假',
    location_abnormal: '位置异常',
    manual: '补签',
  }
  return statusMap[status] || status
}

/**
 * 获取签到状态颜色类型
 */
export function getAttendanceStatusColor(status: AttendanceStatus): string {
  const colorMap: Record<AttendanceStatus, string> = {
    present: 'success',
    late: 'warning',
    absent: 'error',
    leave: 'info',
    location_abnormal: 'warning',
    manual: 'info',
  }
  return colorMap[status] || 'default'
}

/**
 * 判断签到活动是否可以关闭
 */
export function canCloseActivity(activityStatus: string): boolean {
  return activityStatus === 'open'
}

/**
 * 判断是否可以查看签到记录
 */
export function canViewActivityRecords(activityStatus: string): boolean {
  return ['open', 'closed', 'finished'].includes(activityStatus)
}

/**
 * 判断是否可以管理签到记录（补签、修改状态等）
 */
export function canManageActivityRecords(activityStatus: string): boolean {
  return ['open', 'closed'].includes(activityStatus)
}

/**
 * 获取活动操作状态
 */
export function getActivityOperationalState(activityStatus: string): ActivityOperationalState {
  return {
    canClose: canCloseActivity(activityStatus),
    canViewRecords: canViewActivityRecords(activityStatus),
    canManageRecords: canManageActivityRecords(activityStatus),
    statusLabel: getActivityStatusLabel(activityStatus),
    statusType: getActivityStatusType(activityStatus),
  }
}

/**
 * 获取活动状态显示文本
 */
function getActivityStatusLabel(status: string): string {
  const labelMap: Record<string, string> = {
    open: '进行中',
    closed: '已结束',
    finished: '已归档',
    pending: '未开始',
  }
  return labelMap[status] || status
}

/**
 * 获取活动状态类型
 */
function getActivityStatusType(status: string): 'active' | 'ended' | 'pending' {
  if (status === 'open') return 'active'
  if (status === 'pending') return 'pending'
  return 'ended'
}

/**
 * 格式化签到统计文本
 */
export function formatAttendanceStats(stats: { checked_in: number; total: number; absent: number }): string {
  return `已到 ${stats.checked_in} / 应到 ${stats.total}，缺勤 ${stats.absent}`
}

/**
 * 判断学生是否已经签到（有效状态）
 */
export function hasStudentSignedIn(recordStatus?: string): boolean {
  return recordStatus ? ['present', 'late', 'manual'].includes(recordStatus) : false
}

/**
 * 获取可选的签到记录状态选项（教师手动补签用）
 */
export function getRecordStatusOptions(): Array<{ value: AttendanceStatus; label: string }> {
  return [
    { value: 'present', label: '已签到' },
    { value: 'late', label: '迟到' },
    { value: 'manual', label: '补签' },
    { value: 'leave', label: '请假' },
    { value: 'absent', label: '缺勤' },
  ]
}
