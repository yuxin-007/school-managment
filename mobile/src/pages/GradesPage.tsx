import { useEffect, useMemo, useState } from 'react'
import { getMyGrades } from '@/api'
import { getApiErrorMessage } from '@/lib/request'
import type { GradeItem } from '@/types'

const getGradeLabel = (type: string) => {
  const labels: Record<string, string> = {
    final: '期末',
    midterm: '期中',
    regular: '平时',
    assignment: '作业',
    quiz: '测验',
  }
  return labels[type] || type
}

const GradesPage = () => {
  const [items, setItems] = useState<GradeItem[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      const response = await getMyGrades()
      setItems(response.data.data || [])
    }
    void load().catch((err) => setError(getApiErrorMessage(err, '成绩加载失败')))
  }, [])

  const averageScore = useMemo(() => {
    const scores = items.map((item) => item.score).filter((score): score is number => typeof score === 'number')
    if (!scores.length) return '-'
    return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10
  }, [items])

  return (
    <div className="page-stack">
      <section className="section-title">
        <span className="eyebrow">Grades</span>
        <h2>我的成绩</h2>
      </section>
      {error ? <div className="form-error">{error}</div> : null}

      <section className="metric-grid three">
        <div className="metric-card">
          <span>已发布</span>
          <strong>{items.length}</strong>
        </div>
        <div className="metric-card">
          <span>平均分</span>
          <strong>{averageScore}</strong>
        </div>
        <div className="metric-card">
          <span>优秀</span>
          <strong>{items.filter((item) => typeof item.score === 'number' && item.score >= 90).length}</strong>
        </div>
      </section>

      <section className="section-card">
        <div className="section-head">
          <h3>最近发布</h3>
        </div>
        {items.map((item) => (
          <article className="list-row" key={item.id}>
            <div>
              <strong>{item.course_name}</strong>
              <span>{item.course_code} · {getGradeLabel(item.grade_type)}</span>
            </div>
            <span className="score-badge">{item.score ?? '-'}</span>
          </article>
        ))}
        {!items.length && <p className="empty-text">暂无已发布成绩</p>}
      </section>
    </div>
  )
}

export default GradesPage
