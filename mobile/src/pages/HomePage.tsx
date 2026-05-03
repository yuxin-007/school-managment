import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getCourseAssignments,
  getCourseAttendanceActivities,
  getCourses,
  getMySelections,
  getSchedule,
  getUnreadCount,
} from '@/api'
import StatusTag from '@/components/StatusTag'
import { isFreshmanStudent } from '@/lib/freshmanGuide'
import {
  collectFulfilledData,
  filterVisibleCourses,
  getAttendanceDetailPath,
  getOpenAttendancePreview,
  getUnreadTotal,
} from '@/lib/mobileDashboard'
import { isStudent as isStudentRole } from '@/lib/permissions'
import { getApiErrorMessage } from '@/lib/request'
import { getTodayScheduleItems } from '@/lib/schedule'
import { useAuthStore } from '@/store/authStore'
import type { AttendanceActivity, CourseAssignment, CourseItem, ScheduleItem } from '@/types'

const HomePage = () => {
  const user = useAuthStore((state) => state.user)
  const isStudent = isStudentRole(user?.role)
  const showFreshmanGuide = isFreshmanStudent(user)
  const [courses, setCourses] = useState<CourseItem[]>([])
  const [todaySchedule, setTodaySchedule] = useState<ScheduleItem[]>([])
  const [attendance, setAttendance] = useState<AttendanceActivity[]>([])
  const [assignments, setAssignments] = useState<CourseAssignment[]>([])
  const [unread, setUnread] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const courseResponse = await getCourses()
        let visibleCourses = courseResponse.data.data || []

        if (isStudent) {
          try {
            const selectedResponse = await getMySelections()
            visibleCourses = filterVisibleCourses(visibleCourses, user?.role, selectedResponse.data.data || [])
          } catch {
            setError('选课数据暂时不可用，已先展示可访问课程。')
          }
        }

        if (!mounted) return
        setCourses(visibleCourses.slice(0, 4))

        const scheduleResponse = await getSchedule().catch(() => ({ data: { data: [] as ScheduleItem[] } }))
        if (!mounted) return
        setTodaySchedule(getTodayScheduleItems(scheduleResponse.data.data || []))

        const activityGroups = await Promise.allSettled(
          visibleCourses.slice(0, 3).map((course) => getCourseAttendanceActivities(course.id)),
        )
        if (!mounted) return
        setAttendance(getOpenAttendancePreview(collectFulfilledData<AttendanceActivity>(activityGroups), 3))

        const assignmentGroups = await Promise.allSettled(
          visibleCourses.slice(0, 3).map((course) => getCourseAssignments(course.id)),
        )
        if (!mounted) return
        setAssignments(collectFulfilledData<CourseAssignment>(assignmentGroups).slice(0, 4))

        const unreadResponse = await getUnreadCount().catch(() => ({ data: { data: { unread: 0 } } }))
        if (!mounted) return
        setUnread(getUnreadTotal(unreadResponse.data.data))
      } catch (err) {
        if (mounted) setError(getApiErrorMessage(err, '首页数据加载失败'))
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void load()
    return () => {
      mounted = false
    }
  }, [isStudent, user?.role])

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 11) return '早上好'
    if (hour < 18) return '下午好'
    return '晚上好'
  }, [])

  const todoCount = assignments.filter((item) => !item.my_submission).length

  return (
    <div className="page-stack">
      <section className="hero-card">
        <span className="eyebrow">{greeting}</span>
        <h2>{user?.real_name || user?.username}</h2>
        <p>
          {todaySchedule[0]
            ? `下一节：${todaySchedule[0].course_name} · ${todaySchedule[0].time_display}`
            : user?.department_name || '校园移动工作台'}
        </p>
      </section>

      {showFreshmanGuide ? (
        <Link className="freshman-entry-card" to="/freshman-guide">
          <div>
            <span className="eyebrow">New Student</span>
            <h3>新生校园引导</h3>
            <p>找宿舍、食堂、教学楼，打开地图快速导航。</p>
          </div>
          <strong>开始</strong>
        </Link>
      ) : null}

      {loading ? <div className="notice-line">正在同步今日课程、签到和通知...</div> : null}
      {error ? <div className="form-error">{error}</div> : null}

      <section className="metric-grid">
        <Link className="metric-card" to="/schedule">
          <span>今日课程</span>
          <strong>{todaySchedule.length}</strong>
        </Link>
        <Link className="metric-card" to="/courses">
          <span>我的课程</span>
          <strong>{courses.length}</strong>
        </Link>
        <Link className="metric-card" to="/tasks">
          <span>待办</span>
          <strong>{todoCount}</strong>
        </Link>
        <Link className="metric-card" to="/notifications">
          <span>未读</span>
          <strong>{unread}</strong>
        </Link>
      </section>

      <section className="quick-grid">
        <Link to="/schedule">课表</Link>
        <Link to="/leave">请假</Link>
        {isStudent ? <Link to="/grades">成绩</Link> : <Link to="/tasks">批阅</Link>}
      </section>

      <section className="section-card">
        <div className="section-head">
          <h3>当前可签到</h3>
          <Link to="/courses">查看</Link>
        </div>
        {attendance.length ? (
          attendance.map((item) => (
            <Link className="list-row attendance-home-row" key={item.id} to={getAttendanceDetailPath(item)}>
              <div>
                <strong>{item.title}</strong>
                <span>{item.location_name || '未设置地点'}</span>
              </div>
              <span className="attendance-link-cta">
                <StatusTag status={item.status}>{item.status_display}</StatusTag>
                <em>去签到</em>
              </span>
            </Link>
          ))
        ) : (
          <p className="empty-text">当前没有进行中的课程签到</p>
        )}
      </section>

      <section className="section-card">
        <div className="section-head">
          <h3>近期作业</h3>
          <Link to="/tasks">处理</Link>
        </div>
        {assignments.length ? (
          assignments.map((item) => (
            <Link className="list-row" key={item.id} to={`/assignments/${item.id}`}>
              <div>
                <strong>{item.title}</strong>
                <span>截止 {item.due_time || '-'}</span>
              </div>
              <StatusTag status={item.my_submission?.status || item.status}>
                {item.my_submission?.status_display || item.status_display}
              </StatusTag>
            </Link>
          ))
        ) : (
          <p className="empty-text">当前没有课程作业</p>
        )}
      </section>
    </div>
  )
}

export default HomePage
