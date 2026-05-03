import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCourseAssignments, getCourses, getMyGrades, getMySelections } from '@/api'
import { isStudent as isStudentRole } from '@/lib/permissions'
import { getApiErrorMessage } from '@/lib/request'
import { useAuthStore } from '@/store/authStore'
import type { CourseAssignment, CourseItem, CourseSelectionRecord, GradeItem } from '@/types'
import StatusTag from '@/components/StatusTag'

const TasksPage = () => {
  const user = useAuthStore((state) => state.user)
  const isStudent = isStudentRole(user?.role)
  const [assignments, setAssignments] = useState<CourseAssignment[]>([])
  const [grades, setGrades] = useState<GradeItem[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const courseResponse = await getCourses()
        let courses: CourseItem[] = courseResponse.data.data || []
        if (isStudent) {
          const selectedResponse = await getMySelections()
          const selectedIds = new Set(
            (selectedResponse.data.data || [])
              .map((item: CourseSelectionRecord) => item.course_id || item.course?.id)
              .filter(Boolean),
          )
          courses = courses.filter((item) => selectedIds.has(item.id))
        }
        const assignmentGroups = await Promise.all(courses.slice(0, 8).map((course) => getCourseAssignments(course.id)))
        setAssignments(assignmentGroups.flatMap((item) => item.data.data || []))
        if (isStudent) {
          const gradeResponse = await getMyGrades()
          setGrades(gradeResponse.data.data || [])
        }
      } catch (err) {
        setError(getApiErrorMessage(err, '事务加载失败'))
      }
    }
    void load()
  }, [isStudent])

  return (
    <div className="page-stack">
      <section className="section-title">
        <span className="eyebrow">Tasks</span>
        <h2>事务</h2>
      </section>
      {error ? <div className="form-error">{error}</div> : null}
      <section className="section-card">
        <div className="section-head">
          <h3>{isStudent ? '作业待办' : '作业批阅'}</h3>
        </div>
        {assignments.map((assignment) => (
          <Link className="list-row" key={assignment.id} to={`/assignments/${assignment.id}`}>
            <div>
              <strong>{assignment.title}</strong>
              <span>截止 {assignment.due_time || '-'}</span>
            </div>
            <StatusTag status={assignment.my_submission?.status || assignment.status}>
              {assignment.my_submission?.status_display || assignment.status_display}
            </StatusTag>
          </Link>
        ))}
        {!assignments.length && <p className="empty-text">暂无待处理作业</p>}
      </section>

      {isStudent && (
        <section className="section-card">
          <div className="section-head">
            <h3>最近成绩</h3>
          </div>
          {grades.map((grade) => (
            <article className="list-row" key={grade.id}>
              <div>
                <strong>{grade.course_name}</strong>
                <span>
                  {grade.course_code} · {grade.grade_type}
                </span>
              </div>
              <span className="score-badge">{grade.score ?? '-'}</span>
            </article>
          ))}
          {!grades.length && <p className="empty-text">暂无已发布成绩</p>}
        </section>
      )}
    </div>
  )
}

export default TasksPage
