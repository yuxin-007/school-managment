import { describe, expect, test } from 'vitest'
import { getNotificationActionLabel, getNotificationTargetPath } from '@/lib/notificationFlow'
import type { NotificationItem } from '@/types'

const baseNotification: NotificationItem = {
  id: 1,
  title: '通知',
  content: '内容',
  notification_type: 'system',
  is_read: false,
  created_at: '2026-04-30',
}

describe('notification flow helpers', () => {
  test('routes leave notifications to the leave page with the related application id', () => {
    expect(
      getNotificationTargetPath({
        ...baseNotification,
        notification_type: 'leave_approved',
        related_type: 'LeaveApplication',
        related_id: 12,
      }),
    ).toBe('/leave?application=12')
  })

  test('routes assignment and grade notifications to their mobile pages', () => {
    expect(
      getNotificationTargetPath({
        ...baseNotification,
        notification_type: 'assignment_reviewed',
        related_type: 'CourseAssignment',
        related_id: 22,
      }),
    ).toBe('/assignments/22')

    expect(
      getNotificationTargetPath({
        ...baseNotification,
        notification_type: 'grade_published',
        related_type: 'Grade',
        related_id: 33,
      }),
    ).toBe('/grades')
  })

  test('falls back to an empty path when a notification has no supported target', () => {
    expect(getNotificationTargetPath(baseNotification)).toBe('')
    expect(getNotificationTargetPath({ ...baseNotification, related_type: 'CourseAssignment' })).toBe('')
  })

  test('uses action labels that match the target business area', () => {
    expect(getNotificationActionLabel({ ...baseNotification, related_type: 'LeaveApplication', related_id: 1 })).toBe('查看请假')
    expect(getNotificationActionLabel({ ...baseNotification, related_type: 'CourseAssignment', related_id: 1 })).toBe('查看作业')
    expect(getNotificationActionLabel({ ...baseNotification, related_type: 'Grade', related_id: 1 })).toBe('查看成绩')
    expect(getNotificationActionLabel(baseNotification)).toBe('标记已读')
  })
})
