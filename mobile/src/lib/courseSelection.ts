import type { CourseItem, CourseSelectionRecord } from '@/types'

export type CourseSelectionFilter = 'all' | 'selected' | 'available'
export type CourseSelectionStatus = 'selected' | 'available' | 'full' | 'inactive'

export function getSelectedCourseIds(selections: CourseSelectionRecord[]) {
  return new Set(
    selections
      .map((item) => item.course_id || item.course?.id)
      .filter((id): id is number => typeof id === 'number'),
  )
}

export function getCourseSelectionStatus(course: CourseItem, selectedIds: ReadonlySet<number>) {
  const selected = selectedIds.has(course.id)
  if (selected) return { status: 'selected' as const, label: '已选', canSelect: false, canDrop: true }
  if (course.is_active === false) return { status: 'inactive' as const, label: '已停用', canSelect: false, canDrop: false }
  if (course.current_students >= course.max_students) return { status: 'full' as const, label: '已满', canSelect: false, canDrop: false }
  return { status: 'available' as const, label: '可选', canSelect: true, canDrop: false }
}

export function filterCourseSelectionItems(
  courses: CourseItem[],
  selectedIds: ReadonlySet<number>,
  filter: CourseSelectionFilter,
  keyword: string,
) {
  const normalizedKeyword = keyword.trim().toLowerCase()

  return courses.filter((course) => {
    const status = getCourseSelectionStatus(course, selectedIds)
    if (filter === 'selected' && status.status !== 'selected') return false
    if (filter === 'available' && status.status !== 'available') return false
    if (!normalizedKeyword) return true
    return [course.name, course.code, course.teacher_name, course.location]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(normalizedKeyword))
  })
}

export function getCourseSelectionStats(courses: CourseItem[], selectedIds: ReadonlySet<number>) {
  return courses.reduce(
    (stats, course) => {
      const status = getCourseSelectionStatus(course, selectedIds).status
      stats.total += 1
      if (status === 'selected') stats.selected += 1
      if (status === 'available') stats.available += 1
      return stats
    },
    { total: 0, selected: 0, available: 0 },
  )
}
