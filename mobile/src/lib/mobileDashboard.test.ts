import { describe, expect, test } from 'vitest'
import {
  collectFulfilledData,
  filterVisibleCourses,
  getAttendanceDetailPath,
  getAttendanceStatus,
  getOpenAttendancePreview,
  getUnreadTotal,
  normalizeNotificationItems,
} from '@/lib/mobileDashboard'
import type { AttendanceActivity, CourseItem, NotificationItem } from '@/types'

const courses: CourseItem[] = [
  { id: 1, code: 'CS101', name: '移动应用开发', current_students: 28, max_students: 40 },
  { id: 2, code: 'CS102', name: '数据库系统', current_students: 31, max_students: 40 },
  { id: 3, code: 'CS103', name: '软件工程', current_students: 30, max_students: 40 },
]

describe('mobile dashboard helpers', () => {
  test('filters student courses by direct and nested selection ids', () => {
    const visible = filterVisibleCourses(courses, 'student', [
      { course_id: 1 },
      { course: { id: 3, code: 'CS103', name: '软件工程', current_students: 30, max_students: 40 } },
    ])

    expect(visible.map((item) => item.id)).toEqual([1, 3])
  })

  test('keeps all courses for non-student roles', () => {
    expect(filterVisibleCourses(courses, 'staff', []).map((item) => item.id)).toEqual([1, 2, 3])
  })

  test('collects fulfilled list data and ignores failed optional requests', () => {
    const settled = [
      { status: 'fulfilled', value: { data: { data: ['a', 'b'] } } },
      { status: 'rejected', reason: new Error('offline') },
      { status: 'fulfilled', value: { data: { data: ['c'] } } },
    ] as const

    expect(collectFulfilledData<string>(settled)).toEqual(['a', 'b', 'c'])
  })

  test('normalizes notification payloads and unread count variants', () => {
    const items: NotificationItem[] = [
      { id: 1, title: '课程提醒', content: '今天有课', notification_type: 'course', is_read: false, created_at: '2026-04-30' },
    ]

    expect(normalizeNotificationItems({ data: items })).toEqual(items)
    expect(getUnreadTotal({ unread: 2 })).toBe(2)
    expect(getUnreadTotal({ unread_count: 3 })).toBe(3)
  })

  test('builds a limited open-attendance preview for the home page', () => {
    const activities: AttendanceActivity[] = [
      { id: 1, course_id: 11, title: '第一节签到', start_time: '08:00', end_time: '08:20', status: 'closed', status_display: '已结束' },
      { id: 2, course_id: 12, title: '第二节签到', start_time: '10:00', end_time: '10:20', status: 'open', status_display: '进行中' },
      { id: 3, course_id: 13, title: '第三节签到', start_time: '14:00', end_time: '14:20', status: 'open', status_display: '进行中' },
    ]

    expect(getOpenAttendancePreview(activities, 1)).toEqual([activities[1]])
    expect(getAttendanceDetailPath(activities[1])).toBe('/courses/12?attendance=2')
  })

  test('uses the student attendance record status when present', () => {
    const activity: AttendanceActivity = {
      id: 4,
      course_id: 14,
      title: '定位签到',
      start_time: '09:00',
      end_time: '09:15',
      status: 'open',
      status_display: '进行中',
      my_record: { id: 9, status: 'present', status_display: '已签到' },
    }

    expect(getAttendanceStatus(activity)).toEqual({ status: 'present', label: '已签到' })
  })
})
