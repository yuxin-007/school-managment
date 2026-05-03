import type { AttendanceActivity, CourseItem, CourseSelectionRecord, NotificationItem, UserRole } from '@/types'

type ListResponse<T> = {
  data?: {
    data?: readonly T[]
  }
}

export function filterVisibleCourses(
  courses: CourseItem[],
  role: UserRole | undefined,
  selections: CourseSelectionRecord[],
) {
  if (role !== 'student') return courses

  const selectedIds = new Set(
    selections
      .map((item) => item.course_id || item.course?.id)
      .filter((id): id is number => typeof id === 'number'),
  )

  return courses.filter((item) => selectedIds.has(item.id))
}

export function collectFulfilledData<T>(results: readonly PromiseSettledResult<ListResponse<T>>[]) {
  return results.flatMap((result) => {
    if (result.status !== 'fulfilled') return []
    return result.value.data?.data || []
  })
}

export function normalizeNotificationItems(payload: { data?: NotificationItem[] } | NotificationItem[] | null | undefined) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

export function getUnreadTotal(payload: { unread?: number; unread_count?: number } | null | undefined) {
  return payload?.unread ?? payload?.unread_count ?? 0
}

export function getOpenAttendancePreview(activities: AttendanceActivity[], limit = 3) {
  return activities.filter((item) => item.status === 'open').slice(0, limit)
}

export function getAttendanceDetailPath(activity: AttendanceActivity) {
  return `/courses/${activity.course_id}?attendance=${activity.id}`
}

export function getAttendanceStatus(activity: AttendanceActivity) {
  return {
    status: activity.my_record?.status || activity.status,
    label: activity.my_record?.status_display || activity.status_display,
  }
}
