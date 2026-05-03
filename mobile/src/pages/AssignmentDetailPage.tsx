import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getCourseAssignmentSubmissions,
  getCourseAssignments,
  getCourses,
  getMySelections,
  reviewCourseAssignmentSubmission,
  submitCourseAssignment,
} from '@/api'
import StatusTag from '@/components/StatusTag'
import { isStudent as isStudentRole } from '@/lib/permissions'
import { getApiErrorMessage } from '@/lib/request'
import { useAuthStore } from '@/store/authStore'
import type { AssignmentSubmission, CourseAssignment, CourseItem, CourseSelectionRecord } from '@/types'

const AssignmentDetailPage = () => {
  const { assignmentId } = useParams()
  const id = Number(assignmentId)
  const user = useAuthStore((state) => state.user)
  const isStudent = isStudentRole(user?.role)
  const [assignment, setAssignment] = useState<CourseAssignment | null>(null)
  const [course, setCourse] = useState<CourseItem | null>(null)
  const [submissions, setSubmissions] = useState<AssignmentSubmission[]>([])
  const [content, setContent] = useState('')
  const [scoreDraft, setScoreDraft] = useState<Record<number, string>>({})
  const [feedbackDraft, setFeedbackDraft] = useState<Record<number, string>>({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const loadVisibleCourses = useCallback(async () => {
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
    return courses
  }, [isStudent])

  const load = useCallback(async () => {
    if (!id) return
    setError('')
    const courses = await loadVisibleCourses()
    const groups = await Promise.all(courses.map((item) => getCourseAssignments(item.id)))
    const allAssignments = groups.flatMap((item) => item.data.data || [])
    const found = allAssignments.find((item) => item.id === id) || null
    if (!found) {
      setAssignment(null)
      setCourse(null)
      setSubmissions([])
      setError('未找到作业，或当前账号无权查看')
      return
    }
    setAssignment(found)
    setCourse(courses.find((item) => item.id === found?.course_id) || null)
    setContent(found?.my_submission?.content || '')

    if (found && !isStudent) {
      const response = await getCourseAssignmentSubmissions(found.id)
      const items = response.data.data?.submissions || []
      setSubmissions(items)
      setScoreDraft(
        Object.fromEntries(items.filter((item) => item.id).map((item) => [item.id as number, item.score?.toString() || ''])),
      )
      setFeedbackDraft(Object.fromEntries(items.filter((item) => item.id).map((item) => [item.id as number, item.feedback || ''])))
    }
  }, [id, isStudent, loadVisibleCourses])

  useEffect(() => {
    void load().catch((err) => setError(getApiErrorMessage(err, '作业详情加载失败')))
  }, [load])

  const canSubmit = useMemo(() => isStudent && assignment?.status === 'open', [assignment?.status, isStudent])

  const handleSubmit = async () => {
    if (!assignment || !content.trim()) {
      setError('请填写作业内容')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await submitCourseAssignment(assignment.id, content.trim())
      setMessage('作业已提交')
      await load()
    } catch (err) {
      setError(getApiErrorMessage(err, '作业提交失败'))
    } finally {
      setSaving(false)
    }
  }

  const handleReview = async (submission: AssignmentSubmission, action: 'review' | 'return') => {
    if (!submission.id) return
    const scoreText = scoreDraft[submission.id] || ''
    const score = Number(scoreText)
    if (action === 'review' && (!scoreText || Number.isNaN(score))) {
      setError('请填写有效分数')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await reviewCourseAssignmentSubmission(submission.id, {
        action,
        score: action === 'review' ? score : undefined,
        feedback: feedbackDraft[submission.id] || '',
      })
      setMessage(action === 'review' ? '批阅已保存' : '已退回给学生')
      await load()
    } catch (err) {
      setError(getApiErrorMessage(err, '批阅失败'))
    } finally {
      setSaving(false)
    }
  }

  if (!assignment && !error) {
    return <div className="section-card">正在加载作业...</div>
  }

  return (
    <div className="page-stack">
      <section className="hero-card compact">
        <span className="eyebrow">{course?.name || 'Assignment'}</span>
        <h2>{assignment?.title || '作业详情'}</h2>
        <p>截止 {assignment?.due_time || '-'}</p>
      </section>
      {message ? <div className="notice-line">{message}</div> : null}
      {error ? <div className="form-error">{error}</div> : null}

      <section className="section-card">
        <div className="section-head">
          <h3>作业要求</h3>
          {assignment ? <StatusTag status={assignment.my_submission?.status || assignment.status}>{assignment.my_submission?.status_display || assignment.status_display}</StatusTag> : null}
        </div>
        <p className="rich-text">{assignment?.description || '暂无说明'}</p>
        <div className="detail-grid">
          <span>满分 {assignment?.max_score ?? 100}</span>
          <span>{assignment?.allow_late ? '允许迟交' : '不允许迟交'}</span>
        </div>
      </section>

      {isStudent ? (
        <section className="section-card">
          <div className="section-head">
            <h3>我的提交</h3>
            <StatusTag status={assignment?.my_submission?.status || 'missing'}>
              {assignment?.my_submission?.status_display || '未提交'}
            </StatusTag>
          </div>
          {assignment?.my_submission?.score != null ? <div className="score-panel">得分 {assignment.my_submission.score}</div> : null}
          {assignment?.my_submission?.feedback ? <p className="feedback-text">教师反馈：{assignment.my_submission.feedback}</p> : null}
          <textarea
            className="mobile-textarea"
            disabled={!canSubmit || saving}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={canSubmit ? '填写作业内容或提交说明' : '当前作业不可提交'}
          />
          <button className="primary-button" disabled={!canSubmit || saving} onClick={handleSubmit}>
            {saving ? '提交中' : assignment?.my_submission ? '更新提交' : '提交作业'}
          </button>
        </section>
      ) : (
        <section className="section-card">
          <div className="section-head">
            <h3>学生提交</h3>
            <span className="subtle-count">{submissions.filter((item) => item.id).length}/{submissions.length}</span>
          </div>
          {submissions.map((submission) => (
            <article className="submission-card" key={`${submission.student_id}-${submission.id || 'missing'}`}>
              <div className="submission-head">
                <div>
                  <strong>{submission.student_name}</strong>
                  <span>{submission.student_no || '-'} · {submission.major || '-'}</span>
                </div>
                <StatusTag status={submission.status}>{submission.status_display}</StatusTag>
              </div>
              <p className="rich-text">{submission.content || '暂未提交'}</p>
              {submission.id ? (
                <div className="review-panel">
                  <input
                    inputMode="decimal"
                    placeholder="分数"
                    value={scoreDraft[submission.id] || ''}
                    onChange={(event) => setScoreDraft((current) => ({ ...current, [submission.id as number]: event.target.value }))}
                  />
                  <textarea
                    placeholder="反馈"
                    value={feedbackDraft[submission.id] || ''}
                    onChange={(event) =>
                      setFeedbackDraft((current) => ({ ...current, [submission.id as number]: event.target.value }))
                    }
                  />
                  <div className="review-actions">
                    <button className="small-button" disabled={saving} onClick={() => handleReview(submission, 'review')}>
                      保存批阅
                    </button>
                    <button className="ghost-button" disabled={saving} onClick={() => handleReview(submission, 'return')}>
                      退回
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          ))}
          {!submissions.length && <p className="empty-text">暂无提交数据</p>}
        </section>
      )}

      {course ? (
        <Link className="secondary-link" to={`/courses/${course.id}`}>
          返回课程
        </Link>
      ) : null}
    </div>
  )
}

export default AssignmentDetailPage
