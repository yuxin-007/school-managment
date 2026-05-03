import { describe, expect, test } from 'vitest'
import {
  filterCourseSelectionItems,
  getCourseSelectionStats,
  getCourseSelectionStatus,
  getSelectedCourseIds,
} from '@/lib/courseSelection'
import type { CourseItem, CourseSelectionRecord } from '@/types'

const courses: CourseItem[] = [
  {
    id: 1,
    name: '移动应用开发',
    code: 'MOB101',
    teacher_name: '王老师',
    location: 'A101',
    current_students: 20,
    max_students: 40,
    is_active: true,
  },
  {
    id: 2,
    name: '数据结构',
    code: 'CS201',
    teacher_name: '李老师',
    location: 'B201',
    current_students: 40,
    max_students: 40,
    is_active: true,
  },
  {
    id: 3,
    name: '软件测试',
    code: 'QA301',
    teacher_name: '赵老师',
    location: 'C301',
    current_students: 12,
    max_students: 30,
    is_active: false,
  },
]

const selections: CourseSelectionRecord[] = [
  { course_id: 1 },
  {
    course: {
      id: 4,
      name: '创新实践',
      code: 'LAB401',
      current_students: 8,
      max_students: 20,
    },
  },
]

describe('course selection helpers', () => {
  test('normalizes selected ids from direct and nested records', () => {
    expect([...getSelectedCourseIds(selections)]).toEqual([1, 4])
  })

  test('computes course selection status', () => {
    const selectedIds = getSelectedCourseIds(selections)

    expect(getCourseSelectionStatus(courses[0], selectedIds).status).toBe('selected')
    expect(getCourseSelectionStatus(courses[1], selectedIds).status).toBe('full')
    expect(getCourseSelectionStatus(courses[2], selectedIds).status).toBe('inactive')
  })

  test('filters by segment and keyword', () => {
    const selectedIds = getSelectedCourseIds(selections)

    expect(filterCourseSelectionItems(courses, selectedIds, 'selected', '').map((item) => item.id)).toEqual([1])
    expect(filterCourseSelectionItems(courses, selectedIds, 'available', '').map((item) => item.id)).toEqual([])
    expect(filterCourseSelectionItems(courses, selectedIds, 'all', '数据').map((item) => item.id)).toEqual([2])
  })

  test('summarizes total, selected, and available courses', () => {
    const selectedIds = getSelectedCourseIds(selections)

    expect(getCourseSelectionStats(courses, selectedIds)).toEqual({
      total: 3,
      selected: 1,
      available: 0,
    })
  })
})
