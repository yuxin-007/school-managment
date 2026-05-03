import { describe, expect, it } from 'vitest'
import {
  calculateGradeLetter,
  calculateGradeStats,
  canEditGrade,
  formatScore,
  getGradeTypeLabel,
  getGradeTypeOptions,
  getScoreColorType,
  getScoreLevelLabel,
  hasGrade,
  isValidScore,
  prepareGradePayload,
} from './gradeEntry'
import type { StudentGradeInfo } from './gradeEntry'

describe('gradeEntry', () => {
  describe('isValidScore', () => {
    it('应该接受有效分数', () => {
      expect(isValidScore(0)).toBe(true)
      expect(isValidScore(50)).toBe(true)
      expect(isValidScore(100)).toBe(true)
      expect(isValidScore(85.5)).toBe(true)
    })

    it('应该拒绝无效分数', () => {
      expect(isValidScore(null)).toBe(false)
      expect(isValidScore(undefined)).toBe(false)
      expect(isValidScore(-1)).toBe(false)
      expect(isValidScore(101)).toBe(false)
      expect(isValidScore(NaN)).toBe(false)
    })
  })

  describe('formatScore', () => {
    it('应该格式化有效分数', () => {
      expect(formatScore(85)).toBe('85')
      expect(formatScore(85.5)).toBe('85.5')
      expect(formatScore(85.567)).toBe('85.6')
    })

    it('应该处理空值', () => {
      expect(formatScore(null)).toBe('-')
      expect(formatScore(undefined)).toBe('-')
    })
  })

  describe('calculateGradeLetter', () => {
    it('应该返回正确的等级字母', () => {
      expect(calculateGradeLetter(95)).toBe('A')
      expect(calculateGradeLetter(90)).toBe('A')
      expect(calculateGradeLetter(85)).toBe('B')
      expect(calculateGradeLetter(75)).toBe('C')
      expect(calculateGradeLetter(65)).toBe('D')
      expect(calculateGradeLetter(55)).toBe('F')
    })

    it('应该处理空值', () => {
      expect(calculateGradeLetter(null)).toBeNull()
      expect(calculateGradeLetter(undefined)).toBeNull()
    })
  })

  describe('getScoreLevelLabel', () => {
    it('应该返回正确的等级标签', () => {
      expect(getScoreLevelLabel(95)).toBe('优秀')
      expect(getScoreLevelLabel(85)).toBe('良好')
      expect(getScoreLevelLabel(75)).toBe('中等')
      expect(getScoreLevelLabel(65)).toBe('及格')
      expect(getScoreLevelLabel(55)).toBe('不及格')
    })

    it('应该处理空值', () => {
      expect(getScoreLevelLabel(null)).toBe('未录入')
    })
  })

  describe('getScoreColorType', () => {
    it('应该返回正确的颜色类型', () => {
      expect(getScoreColorType(95)).toBe('green')
      expect(getScoreColorType(85)).toBe('blue')
      expect(getScoreColorType(75)).toBe('blue')
      expect(getScoreColorType(65)).toBe('orange')
      expect(getScoreColorType(55)).toBe('red')
    })

    it('应该处理空值', () => {
      expect(getScoreColorType(null)).toBe('neutral')
    })
  })

  describe('getGradeTypeLabel', () => {
    it('应该返回正确的类型标签', () => {
      expect(getGradeTypeLabel('usual')).toBe('平时成绩')
      expect(getGradeTypeLabel('midterm')).toBe('期中成绩')
      expect(getGradeTypeLabel('final')).toBe('期末成绩')
      expect(getGradeTypeLabel('total')).toBe('总评成绩')
    })

    it('应该处理空值或未知类型', () => {
      expect(getGradeTypeLabel(null)).toBe('期末成绩')
      expect(getGradeTypeLabel('unknown')).toBe('unknown')
    })
  })

  describe('getGradeTypeOptions', () => {
    it('应该返回 4 个选项', () => {
      const options = getGradeTypeOptions()
      expect(options).toHaveLength(4)
      expect(options.map((o) => o.value)).toContain('usual')
      expect(options.map((o) => o.value)).toContain('midterm')
      expect(options.map((o) => o.value)).toContain('final')
      expect(options.map((o) => o.value)).toContain('total')
    })
  })

  describe('canEditGrade', () => {
    it('未发布状态应该允许编辑', () => {
      const student: StudentGradeInfo = {
        student_id: 1,
        student_name: '张三',
        student_number: '2024001',
        grade_id: null,
        score: null,
        grade_letter: null,
        grade_type: null,
        is_published: false,
      }
      expect(canEditGrade(student)).toBe(true)
    })

    it('已发布状态应该禁止编辑', () => {
      const student: StudentGradeInfo = {
        student_id: 1,
        student_name: '张三',
        student_number: '2024001',
        grade_id: 1,
        score: 85,
        grade_letter: 'B',
        grade_type: 'final',
        is_published: true,
      }
      expect(canEditGrade(student)).toBe(false)
    })
  })

  describe('hasGrade', () => {
    it('已录入成绩应该返回 true', () => {
      const student: StudentGradeInfo = {
        student_id: 1,
        student_name: '张三',
        student_number: '2024001',
        grade_id: 1,
        score: 85,
        grade_letter: 'B',
        grade_type: 'final',
        is_published: false,
      }
      expect(hasGrade(student)).toBe(true)
    })

    it('未录入成绩应该返回 false', () => {
      const student: StudentGradeInfo = {
        student_id: 1,
        student_name: '张三',
        student_number: '2024001',
        grade_id: null,
        score: null,
        grade_letter: null,
        grade_type: null,
        is_published: false,
      }
      expect(hasGrade(student)).toBe(false)
    })
  })

  describe('prepareGradePayload', () => {
    it('应该准备有效的保存数据', () => {
      const student: StudentGradeInfo = {
        student_id: 1,
        student_name: '张三',
        student_number: '2024001',
        grade_id: null,
        score: 85,
        grade_letter: 'B',
        grade_type: 'final',
        is_published: false,
      }
      const payload = prepareGradePayload(student, 100)
      expect(payload).toEqual({
        student_id: 1,
        course_id: 100,
        score: 85,
        grade_type: 'final',
        is_published: false,
      })
    })

    it('无效分数应该返回 null', () => {
      const student: StudentGradeInfo = {
        student_id: 1,
        student_name: '张三',
        student_number: '2024001',
        grade_id: null,
        score: null,
        grade_letter: null,
        grade_type: null,
        is_published: false,
      }
      expect(prepareGradePayload(student, 100)).toBeNull()
    })
  })

  describe('calculateGradeStats', () => {
    it('应该正确计算统计数据', () => {
      const students: StudentGradeInfo[] = [
        { student_id: 1, student_name: '张三', student_number: '001', grade_id: 1, score: 95, grade_letter: 'A', grade_type: 'final', is_published: true },
        { student_id: 2, student_name: '李四', student_number: '002', grade_id: 2, score: 85, grade_letter: 'B', grade_type: 'final', is_published: true },
        { student_id: 3, student_name: '王五', student_number: '003', grade_id: null, score: null, grade_letter: null, grade_type: null, is_published: false },
        { student_id: 4, student_name: '赵六', student_number: '004', grade_id: 4, score: 55, grade_letter: 'F', grade_type: 'final', is_published: false },
      ]

      const stats = calculateGradeStats(students)
      expect(stats.total).toBe(4)
      expect(stats.entered).toBe(3)
      expect(stats.published).toBe(2)
      expect(stats.average).toBe(78.3)
      expect(stats.excellent).toBe(1)
      expect(stats.fail).toBe(1)
    })

    it('应该处理空列表', () => {
      const stats = calculateGradeStats([])
      expect(stats.total).toBe(0)
      expect(stats.entered).toBe(0)
      expect(stats.published).toBe(0)
      expect(stats.average).toBeNull()
      expect(stats.excellent).toBe(0)
      expect(stats.fail).toBe(0)
    })
  })
})
