/**
 * 成绩录入纯函数
 * 处理成绩输入校验、等级计算、状态判断等逻辑
 */

export type GradeType = 'usual' | 'midterm' | 'final' | 'total'

export interface StudentGradeInfo {
  student_id: number
  student_name: string
  student_number: string
  grade_id: number | null
  score: number | null
  grade_letter: string | null
  grade_type: string | null
  is_published: boolean
}

export interface GradeSavePayload {
  student_id: number
  course_id: number
  score: number
  grade_type: GradeType
  comment?: string
  is_published?: boolean
}

/**
 * 校验分数是否有效（0-100，允许一位小数）
 */
export function isValidScore(score: number | null | undefined): boolean {
  if (score === null || score === undefined) return false
  if (typeof score !== 'number' || isNaN(score)) return false
  if (score < 0 || score > 100) return false
  return true
}

/**
 * 格式化分数显示
 */
export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return '-'
  return String(Math.round(score * 10) / 10)
}

/**
 * 根据分数计算等级字母
 */
export function calculateGradeLetter(score: number | null | undefined): string | null {
  if (score === null || score === undefined) return null
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

/**
 * 根据分数获取等级中文标签
 */
export function getScoreLevelLabel(score: number | null | undefined): string {
  if (score === null || score === undefined) return '未录入'
  if (score >= 90) return '优秀'
  if (score >= 80) return '良好'
  if (score >= 70) return '中等'
  if (score >= 60) return '及格'
  return '不及格'
}

/**
 * 根据分数获取状态颜色类型
 */
export function getScoreColorType(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'neutral'
  if (score >= 90) return 'green'
  if (score >= 80) return 'blue'
  if (score >= 70) return 'blue'
  if (score >= 60) return 'orange'
  return 'red'
}

/**
 * 获取成绩类型显示标签
 */
export function getGradeTypeLabel(type: string | null | undefined): string {
  const labels: Record<string, string> = {
    usual: '平时成绩',
    midterm: '期中成绩',
    final: '期末成绩',
    total: '总评成绩',
  }
  return labels[type || 'final'] || type || '期末成绩'
}

/**
 * 获取成绩类型选项列表
 */
export function getGradeTypeOptions(): Array<{ value: GradeType; label: string }> {
  return [
    { value: 'usual', label: '平时成绩' },
    { value: 'midterm', label: '期中成绩' },
    { value: 'final', label: '期末成绩' },
    { value: 'total', label: '总评成绩' },
  ]
}

/**
 * 判断是否允许录入成绩（未发布状态才允许）
 */
export function canEditGrade(student: StudentGradeInfo): boolean {
  return !student.is_published
}

/**
 * 判断是否已录入成绩
 */
export function hasGrade(student: StudentGradeInfo): boolean {
  return student.grade_id !== null && student.score !== null
}

/**
 * 准备保存成绩的数据
 */
export function prepareGradePayload(
  student: StudentGradeInfo,
  courseId: number,
  gradeType: GradeType = 'final',
): GradeSavePayload | null {
  if (!isValidScore(student.score)) return null
  return {
    student_id: student.student_id,
    course_id: courseId,
    score: student.score!,
    grade_type: (student.grade_type as GradeType) || gradeType,
    is_published: student.is_published,
  }
}

/**
 * 统计成绩数据
 */
export function calculateGradeStats(students: StudentGradeInfo[]): {
  total: number
  entered: number
  published: number
  average: number | null
  excellent: number
  fail: number
} {
  const total = students.length
  const entered = students.filter((s) => s.score !== null).length
  const published = students.filter((s) => s.is_published).length
  const scores = students.map((s) => s.score).filter((s): s is number => s !== null)
  const average = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null
  const excellent = scores.filter((s) => s >= 90).length
  const fail = scores.filter((s) => s < 60).length

  return { total, entered, published, average, excellent, fail }
}
