import { describe, expect, it } from 'vitest'
import {
  calculateCourseAssignmentStats,
  calculatePendingReviewCount,
  filterAssignments,
  formatDueTime,
  formatSubmissionStats,
  getAssignmentFilterOptions,
  getAssignmentReviewStatus,
  getAssignmentReviewStatusColor,
  getAssignmentReviewStatusLabel,
  isAssignmentOverdue,
} from './assignmentReview'
import type { AssignmentWithStats } from './assignmentReview'

describe('assignmentReview', () => {
  describe('calculatePendingReviewCount', () => {
    it('应该正确计算待批阅数量', () => {
      expect(calculatePendingReviewCount({ submitted: 10, reviewed: 3 })).toBe(7)
      expect(calculatePendingReviewCount({ submitted: 5, reviewed: 5 })).toBe(0)
      expect(calculatePendingReviewCount({ submitted: 0, reviewed: 0 })).toBe(0)
    })

    it('已批阅数大于已提交数时应该返回 0', () => {
      expect(calculatePendingReviewCount({ submitted: 3, reviewed: 5 })).toBe(0)
    })
  })

  describe('getAssignmentReviewStatus', () => {
    it('没有统计数据应该返回 pending', () => {
      const assignment: AssignmentWithStats = {
        id: 1, course_id: 1, title: '作业1', description: '', due_time: '', status: 'open', status_display: '进行中',
      }
      expect(getAssignmentReviewStatus(assignment)).toBe('pending')
    })

    it('总数为 0 应该返回 pending', () => {
      const assignment: AssignmentWithStats = {
        id: 1, course_id: 1, title: '作业1', description: '', due_time: '', status: 'open', status_display: '进行中',
        stats: { total: 0, submitted: 0, reviewed: 0 },
      }
      expect(getAssignmentReviewStatus(assignment)).toBe('pending')
    })

    it('已提交为 0 应该返回 pending', () => {
      const assignment: AssignmentWithStats = {
        id: 1, course_id: 1, title: '作业1', description: '', due_time: '', status: 'open', status_display: '进行中',
        stats: { total: 30, submitted: 0, reviewed: 0 },
      }
      expect(getAssignmentReviewStatus(assignment)).toBe('pending')
    })

    it('有待批阅应该返回 needs_review', () => {
      const assignment: AssignmentWithStats = {
        id: 1, course_id: 1, title: '作业1', description: '', due_time: '', status: 'open', status_display: '进行中',
        stats: { total: 30, submitted: 20, reviewed: 15 },
      }
      expect(getAssignmentReviewStatus(assignment)).toBe('needs_review')
    })

    it('全部批阅完成应该返回 completed', () => {
      const assignment: AssignmentWithStats = {
        id: 1, course_id: 1, title: '作业1', description: '', due_time: '', status: 'finished', status_display: '已结束',
        stats: { total: 30, submitted: 25, reviewed: 25 },
      }
      expect(getAssignmentReviewStatus(assignment)).toBe('completed')
    })
  })

  describe('getAssignmentReviewStatusLabel', () => {
    it('应该返回正确的状态标签', () => {
      expect(getAssignmentReviewStatusLabel('pending')).toBe('未开始')
      expect(getAssignmentReviewStatusLabel('in_progress')).toBe('进行中')
      expect(getAssignmentReviewStatusLabel('needs_review')).toBe('待批阅')
      expect(getAssignmentReviewStatusLabel('completed')).toBe('已完成')
    })
  })

  describe('getAssignmentReviewStatusColor', () => {
    it('应该返回正确的颜色类型', () => {
      expect(getAssignmentReviewStatusColor('pending')).toBe('neutral')
      expect(getAssignmentReviewStatusColor('in_progress')).toBe('blue')
      expect(getAssignmentReviewStatusColor('needs_review')).toBe('orange')
      expect(getAssignmentReviewStatusColor('completed')).toBe('green')
    })
  })

  describe('formatSubmissionStats', () => {
    it('应该格式化提交统计', () => {
      expect(formatSubmissionStats({ total: 30, submitted: 20, reviewed: 15 })).toBe('已交 20/30，已批 15')
      expect(formatSubmissionStats({ total: 30, submitted: 0, reviewed: 0 })).toBe('已交 0/30，已批 0')
    })
  })

  describe('filterAssignments', () => {
    const assignments: AssignmentWithStats[] = [
      { id: 1, course_id: 1, title: '作业1', description: '', due_time: '', status: 'open', status_display: '', stats: { total: 30, submitted: 0, reviewed: 0 } },
      { id: 2, course_id: 1, title: '作业2', description: '', due_time: '', status: 'open', status_display: '', stats: { total: 30, submitted: 20, reviewed: 15 } },
      { id: 3, course_id: 1, title: '作业3', description: '', due_time: '', status: 'finished', status_display: '', stats: { total: 30, submitted: 25, reviewed: 25 } },
    ]

    it('应该返回全部作业', () => {
      expect(filterAssignments(assignments, 'all')).toHaveLength(3)
    })

    it('应该筛选待批阅作业', () => {
      const filtered = filterAssignments(assignments, 'needs_review')
      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe(2)
    })

    it('应该筛选已完成作业', () => {
      const filtered = filterAssignments(assignments, 'completed')
      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe(3)
    })
  })

  describe('calculateCourseAssignmentStats', () => {
    it('应该正确计算汇总统计', () => {
      const assignments: AssignmentWithStats[] = [
        { id: 1, course_id: 1, title: '作业1', description: '', due_time: '', status: 'open', status_display: '进行中', stats: { total: 30, submitted: 0, reviewed: 0 } },
        { id: 2, course_id: 1, title: '作业2', description: '', due_time: '', status: 'open', status_display: '进行中', stats: { total: 30, submitted: 20, reviewed: 15 } },
        { id: 3, course_id: 1, title: '作业3', description: '', due_time: '', status: 'finished', status_display: '已结束', stats: { total: 30, submitted: 25, reviewed: 25 } },
      ]

      const stats = calculateCourseAssignmentStats(assignments)
      expect(stats.total).toBe(3)
      expect(stats.needsReview).toBe(1)
      expect(stats.completed).toBe(1)
      expect(stats.totalSubmissions).toBe(45)
      expect(stats.totalReviewed).toBe(40)
    })

    it('应该处理空列表', () => {
      const stats = calculateCourseAssignmentStats([])
      expect(stats.total).toBe(0)
      expect(stats.needsReview).toBe(0)
      expect(stats.completed).toBe(0)
    })
  })

  describe('isAssignmentOverdue', () => {
    it('应该判断已过期作业', () => {
      expect(isAssignmentOverdue('2020-01-01')).toBe(true)
    })

    it('应该判断未过期作业', () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString()
      expect(isAssignmentOverdue(futureDate)).toBe(false)
    })

    it('空时间应该返回 false', () => {
      expect(isAssignmentOverdue('')).toBe(false)
    })
  })

  describe('formatDueTime', () => {
    it('应该处理空时间', () => {
      expect(formatDueTime('')).toBe('无截止时间')
    })

    it('应该处理已截止时间', () => {
      expect(formatDueTime('2020-01-01')).toBe('已截止')
    })

    it('应该格式化未来时间', () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString()
      expect(formatDueTime(futureDate)).toContain('小时后截止')
    })
  })

  describe('getAssignmentFilterOptions', () => {
    it('应该返回 3 个筛选选项', () => {
      const options = getAssignmentFilterOptions()
      expect(options).toHaveLength(3)
      expect(options.map((o) => o.value)).toContain('all')
      expect(options.map((o) => o.value)).toContain('needs_review')
      expect(options.map((o) => o.value)).toContain('completed')
    })
  })
})
