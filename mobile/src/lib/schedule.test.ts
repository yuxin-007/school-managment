import { describe, expect, it } from 'vitest'
import { getTodayScheduleItems, groupScheduleByDay } from './schedule'
import type { ScheduleItem } from '@/types'

const items: ScheduleItem[] = [
  {
    course_id: 1,
    course_name: '高等数学',
    course_code: 'MATH101',
    teacher_name: '王老师',
    location: '一教 203',
    day_of_week: 3,
    day_display: '周三',
    start_time: '08:00',
    end_time: '09:40',
    time_display: '08:00-09:40',
  },
  {
    course_id: 2,
    course_name: '大学英语',
    course_code: 'ENG201',
    teacher_name: '李老师',
    location: '二教 106',
    day_of_week: 1,
    day_display: '周一',
    start_time: '14:00',
    end_time: '15:40',
    time_display: '14:00-15:40',
  },
]

describe('schedule helpers', () => {
  it('groups schedule items by weekday and keeps empty days', () => {
    const groups = groupScheduleByDay(items)

    expect(groups).toHaveLength(7)
    expect(groups[0]).toMatchObject({ dayOfWeek: 1, label: '周一' })
    expect(groups[0].items.map((item) => item.course_name)).toEqual(['大学英语'])
    expect(groups[2].items.map((item) => item.course_name)).toEqual(['高等数学'])
    expect(groups[6].items).toEqual([])
  })

  it('returns today items using JavaScript Sunday as 0 mapping', () => {
    const monday = new Date('2026-04-27T08:00:00')
    const sunday = new Date('2026-05-03T08:00:00')

    expect(getTodayScheduleItems(items, monday).map((item) => item.course_code)).toEqual(['ENG201'])
    expect(getTodayScheduleItems(items, sunday)).toEqual([])
  })
})
