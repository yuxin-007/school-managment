import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { message } from 'antd'
import request from '@/lib/request'
import { getApiErrorMessage } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import type { CourseItem, CourseSelectionRecord } from '@/features/courses/types'

export function useStudentCourses() {
  const [searchParams] = useSearchParams()
  const { user } = useAuthStore()
  const isStudent = user?.role === 'student'
  const canManage = user?.role === 'staff' || user?.role === 'college_admin' || user?.role === 'super_admin'

  const [courses, setCourses] = useState<CourseItem[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<number | undefined>()
  const [loading, setLoading] = useState(true)

  const selectedCourse = useMemo(
    () => courses.find((item) => item.id === selectedCourseId),
    [courses, selectedCourseId],
  )

  const loadCourses = useCallback(async () => {
    setLoading(true)
    try {
      const response = await request.get('/course/api/courses', { skipErrorMessage: true })
      let items: CourseItem[] = response.data.data || []
      if (isStudent) {
        const selectedResponse = await request.get('/course/api/courses/my-selections', { skipErrorMessage: true })
        const selectedIds = new Set(
          (selectedResponse.data.data || [])
            .map((item: CourseSelectionRecord) => item.course_id || item.course?.id)
            .filter(Boolean),
        )
        items = items.filter((item) => selectedIds.has(item.id))
      }
      setCourses(items)
      const requestedId = Number(searchParams.get('course_id'))
      setSelectedCourseId((current) => {
        if (current && items.some((item) => item.id === current)) return current
        if (requestedId && items.some((item) => item.id === requestedId)) return requestedId
        return items[0]?.id
      })
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '课程加载失败'))
    } finally {
      setLoading(false)
    }
  }, [isStudent, searchParams])

  useEffect(() => {
    loadCourses()
  }, [loadCourses])

  return {
    courses,
    selectedCourseId,
    setSelectedCourseId,
    selectedCourse,
    isStudent,
    canManage,
    loading,
    loadCourses,
  }
}
