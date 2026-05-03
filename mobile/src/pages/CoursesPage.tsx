import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { dropCourse, getCourses, getMySelections, selectCourse } from '@/api'
import StatusTag from '@/components/StatusTag'
import {
  filterCourseSelectionItems,
  getCourseSelectionStats,
  getCourseSelectionStatus,
  getSelectedCourseIds,
  type CourseSelectionFilter,
} from '@/lib/courseSelection'
import { isStudent as isStudentRole } from '@/lib/permissions'
import { getApiErrorMessage } from '@/lib/request'
import { useAuthStore } from '@/store/authStore'
import type { CourseItem, CourseSelectionRecord } from '@/types'

const filters: Array<{ value: CourseSelectionFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'selected', label: '已选' },
  { value: 'available', label: '可选' },
]

const CoursesPage = () => {
  const user = useAuthStore((state) => state.user)
  const isStudent = isStudentRole(user?.role)
  const [courses, setCourses] = useState<CourseItem[]>([])
  const [selections, setSelections] = useState<CourseSelectionRecord[]>([])
  const [filter, setFilter] = useState<CourseSelectionFilter>(isStudent ? 'selected' : 'all')
  const [keyword, setKeyword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<number | null>(null)

  const selectedIds = useMemo(() => getSelectedCourseIds(selections), [selections])
  const stats = useMemo(() => getCourseSelectionStats(courses, selectedIds), [courses, selectedIds])
  const visibleCourses = useMemo(
    () => filterCourseSelectionItems(courses, selectedIds, isStudent ? filter : 'all', keyword),
    [courses, filter, isStudent, keyword, selectedIds],
  )

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await getCourses()
      setCourses(response.data.data || [])
      if (isStudent) {
        const selectedResponse = await getMySelections()
        setSelections(selectedResponse.data.data || [])
      } else {
        setSelections([])
      }
    } catch (err) {
      setError(getApiErrorMessage(err, '课程加载失败'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [isStudent])

  useEffect(() => {
    setFilter(isStudent ? 'selected' : 'all')
  }, [isStudent])

  const handleSelectionAction = async (course: CourseItem, action: 'select' | 'drop') => {
    setActionId(course.id)
    setMessage('')
    setError('')
    try {
      if (action === 'select') {
        await selectCourse(course.id)
        setMessage('选课成功，课表和课程列表已同步更新。')
      } else {
        await dropCourse(course.id)
        setMessage('退选成功，课表和课程列表已同步更新。')
      }
      await load()
    } catch (err) {
      setError(getApiErrorMessage(err, action === 'select' ? '选课失败' : '退选失败'))
    } finally {
      setActionId(null)
    }
  }

  return (
    <div className="page-stack">
      <section className="section-title">
        <span className="eyebrow">Courses</span>
        <h2>{isStudent ? '移动选课' : '授课课程'}</h2>
      </section>
      {loading ? <div className="notice-line">正在同步课程...</div> : null}
      {message ? <div className="notice-line">{message}</div> : null}
      {error ? <div className="form-error">{error}</div> : null}

      {isStudent ? (
        <section className="section-card course-selection-panel">
          <div className="metric-grid three">
            <div className="metric-card">
              <span>课程总数</span>
              <strong>{stats.total}</strong>
            </div>
            <div className="metric-card">
              <span>已选</span>
              <strong>{stats.selected}</strong>
            </div>
            <div className="metric-card">
              <span>可选</span>
              <strong>{stats.available}</strong>
            </div>
          </div>
          <div className="mobile-search">
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索课程、教师或地点"
            />
          </div>
          <div className="mobile-segmented" aria-label="课程筛选">
            {filters.map((item) => (
              <button
                className={filter === item.value ? 'active' : ''}
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="card-list">
        {visibleCourses.map((course) => {
          const status = getCourseSelectionStatus(course, selectedIds)
          const busy = actionId === course.id

          return (
            <article className="course-card course-selection-card" key={course.id}>
              <Link className="course-card-main" to={`/courses/${course.id}`}>
                <span className="course-code">{course.code}</span>
                <h3>{course.name}</h3>
                <p>
                  {course.teacher_name || '未配置教师'} · {course.location || '未设置地点'}
                </p>
                {course.schedules?.length ? (
                  <p>{course.schedules.map((item) => `${item.day_display || '周'} ${item.start_time}-${item.end_time}`).join(' / ')}</p>
                ) : null}
              </Link>
              <div className="course-card-side">
                <span className="course-count">
                  {course.current_students}/{course.max_students}
                </span>
                {isStudent ? (
                  <>
                    <StatusTag status={status.status}>{status.label}</StatusTag>
                    {status.canSelect ? (
                      <button className="small-button" disabled={busy} onClick={() => handleSelectionAction(course, 'select')}>
                        {busy ? '处理中' : '选课'}
                      </button>
                    ) : null}
                    {status.canDrop ? (
                      <button className="ghost-button" disabled={busy} onClick={() => handleSelectionAction(course, 'drop')}>
                        {busy ? '处理中' : '退选'}
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </article>
          )
        })}
        {!visibleCourses.length && !loading ? <p className="empty-text">当前没有符合条件的课程</p> : null}
      </div>
    </div>
  )
}

export default CoursesPage
