import { describe, expect, it } from 'vitest'
import {
  calculateAttendanceRate,
  canCloseActivity,
  canManageActivityRecords,
  canManageCourse,
  canViewActivityRecords,
  formatAttendanceStats,
  getAttendanceStatusColor,
  getAttendanceStatusText,
  getActivityOperationalState,
  getRecordStatusOptions,
  hasStudentSignedIn,
} from './classroomManagement'

describe('classroomManagement', () => {
  describe('canManageCourse', () => {
    it('应该允许 staff 角色管理课程', () => {
      expect(canManageCourse('staff')).toBe(true)
    })

    it('应该允许 college_admin 角色管理课程', () => {
      expect(canManageCourse('college_admin')).toBe(true)
    })

    it('应该允许 super_admin 角色管理课程', () => {
      expect(canManageCourse('super_admin')).toBe(true)
    })

    it('应该禁止 student 角色管理课程', () => {
      expect(canManageCourse('student')).toBe(false)
    })

    it('应该禁止未知角色管理课程', () => {
      expect(canManageCourse('unknown')).toBe(false)
    })
  })

  describe('calculateAttendanceRate', () => {
    it('应该正确计算出勤率', () => {
      const stats = { total: 10, present: 7, late: 1, absent: 2, manual: 0, attendance_rate: null }
      expect(calculateAttendanceRate(stats)).toBe(80)
    })

    it('应该包含补签在出勤计算中', () => {
      const stats = { total: 10, present: 5, late: 2, absent: 1, manual: 2, attendance_rate: null }
      expect(calculateAttendanceRate(stats)).toBe(90)
    })

    it('总数为 0 时应该返回 null', () => {
      const stats = { total: 0, present: 0, late: 0, absent: 0, manual: 0, attendance_rate: null }
      expect(calculateAttendanceRate(stats)).toBeNull()
    })

    it('应该保留一位小数', () => {
      const stats = { total: 3, present: 1, late: 0, absent: 2, manual: 0, attendance_rate: null }
      expect(calculateAttendanceRate(stats)).toBe(33.3)
    })
  })

  describe('getAttendanceStatusText', () => {
    it('应该返回正确的状态文本', () => {
      expect(getAttendanceStatusText('present')).toBe('已签到')
      expect(getAttendanceStatusText('late')).toBe('迟到')
      expect(getAttendanceStatusText('absent')).toBe('未签到')
      expect(getAttendanceStatusText('leave')).toBe('请假')
      expect(getAttendanceStatusText('location_abnormal')).toBe('位置异常')
      expect(getAttendanceStatusText('manual')).toBe('补签')
    })
  })

  describe('getAttendanceStatusColor', () => {
    it('应该返回正确的颜色类型', () => {
      expect(getAttendanceStatusColor('present')).toBe('success')
      expect(getAttendanceStatusColor('late')).toBe('warning')
      expect(getAttendanceStatusColor('absent')).toBe('error')
      expect(getAttendanceStatusColor('leave')).toBe('info')
    })
  })

  describe('canCloseActivity', () => {
    it('应该允许关闭 open 状态的活动', () => {
      expect(canCloseActivity('open')).toBe(true)
    })

    it('应该禁止关闭已结束的活动', () => {
      expect(canCloseActivity('closed')).toBe(false)
      expect(canCloseActivity('finished')).toBe(false)
    })
  })

  describe('canViewActivityRecords', () => {
    it('应该允许查看 open 状态的记录', () => {
      expect(canViewActivityRecords('open')).toBe(true)
    })

    it('应该允许查看 closed 状态的记录', () => {
      expect(canViewActivityRecords('closed')).toBe(true)
    })

    it('应该禁止查看 pending 状态的记录', () => {
      expect(canViewActivityRecords('pending')).toBe(false)
    })
  })

  describe('canManageActivityRecords', () => {
    it('应该允许管理 open 状态的记录', () => {
      expect(canManageActivityRecords('open')).toBe(true)
    })

    it('应该允许管理 closed 状态的记录', () => {
      expect(canManageActivityRecords('closed')).toBe(true)
    })

    it('应该禁止管理 finished 状态的记录', () => {
      expect(canManageActivityRecords('finished')).toBe(false)
    })
  })

  describe('getActivityOperationalState', () => {
    it('应该返回正确的 open 状态操作能力', () => {
      const state = getActivityOperationalState('open')
      expect(state.canClose).toBe(true)
      expect(state.canViewRecords).toBe(true)
      expect(state.canManageRecords).toBe(true)
      expect(state.statusLabel).toBe('进行中')
      expect(state.statusType).toBe('active')
    })

    it('应该返回正确的 closed 状态操作能力', () => {
      const state = getActivityOperationalState('closed')
      expect(state.canClose).toBe(false)
      expect(state.canViewRecords).toBe(true)
      expect(state.canManageRecords).toBe(true)
      expect(state.statusLabel).toBe('已结束')
      expect(state.statusType).toBe('ended')
    })
  })

  describe('formatAttendanceStats', () => {
    it('应该格式化签到统计', () => {
      const stats = { checked_in: 25, total: 30, absent: 5 }
      expect(formatAttendanceStats(stats)).toBe('已到 25 / 应到 30，缺勤 5')
    })
  })

  describe('hasStudentSignedIn', () => {
    it('应该识别已签到状态', () => {
      expect(hasStudentSignedIn('present')).toBe(true)
      expect(hasStudentSignedIn('late')).toBe(true)
      expect(hasStudentSignedIn('manual')).toBe(true)
    })

    it('应该识别未签到状态', () => {
      expect(hasStudentSignedIn('absent')).toBe(false)
      expect(hasStudentSignedIn('leave')).toBe(false)
      expect(hasStudentSignedIn()).toBe(false)
    })
  })

  describe('getRecordStatusOptions', () => {
    it('应该返回 5 个状态选项', () => {
      const options = getRecordStatusOptions()
      expect(options).toHaveLength(5)
    })

    it('应该包含所有必要状态', () => {
      const options = getRecordStatusOptions()
      const values = options.map((opt) => opt.value)
      expect(values).toContain('present')
      expect(values).toContain('late')
      expect(values).toContain('manual')
      expect(values).toContain('leave')
      expect(values).toContain('absent')
    })
  })
})
