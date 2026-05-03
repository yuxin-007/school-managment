import type { NotificationItem } from '@/types'

export function getNotificationTargetPath(item: NotificationItem) {
  if (!item.related_id) return ''

  if (item.related_type === 'LeaveApplication') {
    return `/leave?application=${item.related_id}`
  }

  if (item.related_type === 'CourseAssignment') {
    return `/assignments/${item.related_id}`
  }

  if (item.related_type === 'Grade') {
    return '/grades'
  }

  return ''
}

export function getNotificationActionLabel(item: NotificationItem) {
  if (item.related_type === 'LeaveApplication' && item.related_id) return '查看请假'
  if (item.related_type === 'CourseAssignment' && item.related_id) return '查看作业'
  if (item.related_type === 'Grade' && item.related_id) return '查看成绩'
  return '标记已读'
}
