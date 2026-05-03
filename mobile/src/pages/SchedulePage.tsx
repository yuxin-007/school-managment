import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSchedule } from '@/api'
import { getApiErrorMessage } from '@/lib/request'
import { getTodayScheduleItems, groupScheduleByDay } from '@/lib/schedule'
import type { ScheduleItem } from '@/types'

const SchedulePage = () => {
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [selectedDay, setSelectedDay] = useState(() => {
    const day = new Date().getDay()
    return day === 0 ? 7 : day
  })
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      const response = await getSchedule()
      setItems(response.data.data || [])
    }
    void load().catch((err) => setError(getApiErrorMessage(err, '课表加载失败')))
  }, [])

  const groups = useMemo(() => groupScheduleByDay(items), [items])
  const todayItems = useMemo(() => getTodayScheduleItems(items), [items])
  const selectedGroup = groups.find((group) => group.dayOfWeek === selectedDay)

  return (
    <div className="page-stack">
      <section className="section-title">
        <span className="eyebrow">Schedule</span>
        <h2>我的课表</h2>
      </section>
      {error ? <div className="form-error">{error}</div> : null}

      <section className="hero-card compact">
        <span className="eyebrow">Today</span>
        <h2>{todayItems.length ? `今天 ${todayItems.length} 节课` : '今天暂无课程'}</h2>
        <p>{todayItems[0] ? `${todayItems[0].time_display} · ${todayItems[0].course_name}` : '适合处理作业、请假和通知待办'}</p>
      </section>

      <section className="section-card">
        <div className="schedule-day-tabs" aria-label="选择星期">
          {groups.map((group) => (
            <button
              className={group.dayOfWeek === selectedDay ? 'active' : ''}
              key={group.dayOfWeek}
              onClick={() => setSelectedDay(group.dayOfWeek)}
            >
              <span>{group.label.replace('周', '')}</span>
              <strong>{group.items.length}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="section-card">
        <div className="section-head">
          <h3>{selectedGroup?.label || '课程'}</h3>
          <Link to="/courses">课程详情</Link>
        </div>
        {selectedGroup?.items.map((item) => (
          <Link className="schedule-row" key={`${item.course_id}-${item.day_of_week}-${item.start_time}`} to={`/courses/${item.course_id}`}>
            <time>{item.time_display}</time>
            <div>
              <strong>{item.course_name}</strong>
              <span>{item.location || '未设置地点'} · {item.teacher_name || '未配置教师'}</span>
            </div>
          </Link>
        ))}
        {!selectedGroup?.items.length && <p className="empty-text">这一天暂无课程安排</p>}
      </section>
    </div>
  )
}

export default SchedulePage
