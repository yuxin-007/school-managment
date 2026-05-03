import type { ScheduleItem } from '@/types'

export interface ScheduleDayGroup {
  dayOfWeek: number
  label: string
  items: ScheduleItem[]
}

const weekLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const toSchoolWeekday = (date: Date) => {
  const day = date.getDay()
  return day === 0 ? 7 : day
}

export const groupScheduleByDay = (items: ScheduleItem[]): ScheduleDayGroup[] =>
  weekLabels.map((label, index) => {
    const dayOfWeek = index + 1
    return {
      dayOfWeek,
      label,
      items: items
        .filter((item) => item.day_of_week === dayOfWeek)
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    }
  })

export const getTodayScheduleItems = (items: ScheduleItem[], date = new Date()) => {
  const dayOfWeek = toSchoolWeekday(date)
  return items.filter((item) => item.day_of_week === dayOfWeek).sort((a, b) => a.start_time.localeCompare(b.start_time))
}
