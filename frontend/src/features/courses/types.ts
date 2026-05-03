export interface CourseItem {
  id: number
  name: string
  code: string
  description?: string
  credit?: number
  hours?: number
  teacher_name?: string
  location?: string
  max_students: number
  current_students: number
  semester?: string
  is_active?: boolean
  schedules?: ScheduleItem[]
}

export interface ScheduleItem {
  day_of_week: number
  start_period?: number
  end_period?: number
  start_time?: string
  end_time?: string
  day_display?: string
  day_of_week_display?: string
  location?: string
}

export interface CourseSelectionRecord {
  id?: number
  course_id?: number
  course?: CourseItem
}
