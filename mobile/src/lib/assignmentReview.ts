/**
 * 作业批阅纯函数
 * 处理作业批阅状态判断、统计计算、筛选等逻辑
 */

export type AssignmentReviewStatus = 'pending' | 'in_progress' | 'needs_review' | 'completed'

export type AssignmentFilter = 'all' | 'needs_review' | 'completed'

export interface AssignmentWithStats {
  id: number
  course_id: number
  title: string
  description: string
  due_time: string
  max_score?: number
  allow_late?: boolean
  status: string
  status_display: string
  stats?: {
    total: number
    submitted: number
    reviewed: number
  }
}

/**
 * 计算待批阅数量
 */
export function calculatePendingReviewCount(stats: { submitted: number; reviewed: number }): number {
  return Math.max(0, stats.submitted - stats.reviewed)
}

/**
 * 判断作业批阅状态
 */
export function getAssignmentReviewStatus(assignment: AssignmentWithStats): AssignmentReviewStatus {
  const stats = assignment.stats
  if (!stats) return 'pending'

  if (stats.total === 0) return 'pending'
  if (stats.submitted === 0) return 'pending'

  const pendingReview = calculatePendingReviewCount(stats)
  if (pendingReview === 0 && stats.reviewed === stats.submitted) return 'completed'
  if (pendingReview > 0) return 'needs_review'
  return 'in_progress'
}

/**
 * 获取批阅状态显示标签
 */
export function getAssignmentReviewStatusLabel(status: AssignmentReviewStatus): string {
  const labels: Record<AssignmentReviewStatus, string> = {
    pending: '未开始',
    in_progress: '进行中',
    needs_review: '待批阅',
    completed: '已完成',
  }
  return labels[status]
}

/**
 * 获取批阅状态颜色类型
 */
export function getAssignmentReviewStatusColor(status: AssignmentReviewStatus): string {
  const colors: Record<AssignmentReviewStatus, string> = {
    pending: 'neutral',
    in_progress: 'blue',
    needs_review: 'orange',
    completed: 'green',
  }
  return colors[status]
}

/**
 * 格式化提交统计文本
 */
export function formatSubmissionStats(stats: { total: number; submitted: number; reviewed: number }): string {
  return `已交 ${stats.submitted}/${stats.total}，已批 ${stats.reviewed}`
}

/**
 * 筛选作业列表
 */
export function filterAssignments(assignments: AssignmentWithStats[], filter: AssignmentFilter): AssignmentWithStats[] {
  if (filter === 'all') return assignments
  return assignments.filter((assignment) => {
    const status = getAssignmentReviewStatus(assignment)
    return status === filter
  })
}

/**
 * 计算课程作业统计汇总
 */
export function calculateCourseAssignmentStats(assignments: AssignmentWithStats[]): {
  total: number
  needsReview: number
  completed: number
  totalSubmissions: number
  totalReviewed: number
} {
  const total = assignments.length
  let needsReview = 0
  let completed = 0
  let totalSubmissions = 0
  let totalReviewed = 0

  for (const assignment of assignments) {
    const status = getAssignmentReviewStatus(assignment)
    if (status === 'needs_review') needsReview++
    if (status === 'completed') completed++
    if (assignment.stats) {
      totalSubmissions += assignment.stats.submitted
      totalReviewed += assignment.stats.reviewed
    }
  }

  return { total, needsReview, completed, totalSubmissions, totalReviewed }
}

/**
 * 判断作业是否已过截止时间
 */
export function isAssignmentOverdue(dueTime: string): boolean {
  if (!dueTime) return false
  return new Date(dueTime) < new Date()
}

/**
 * 格式化截止时间显示
 */
export function formatDueTime(dueTime: string): string {
  if (!dueTime) return '无截止时间'
  const date = new Date(dueTime)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  if (diffMs < 0) return '已截止'
  if (diffHours < 24) return `${Math.ceil(diffHours)} 小时后截止`
  if (diffHours < 48) return '明天截止'

  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}月${day}日截止`
}

/**
 * 获取筛选选项列表
 */
export function getAssignmentFilterOptions(): Array<{ value: AssignmentFilter; label: string }> {
  return [
    { value: 'all', label: '全部' },
    { value: 'needs_review', label: '待批阅' },
    { value: 'completed', label: '已完成' },
  ]
}
