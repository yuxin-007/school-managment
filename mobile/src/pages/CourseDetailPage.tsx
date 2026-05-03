import { Geolocation } from '@capacitor/geolocation'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  closeCourseAttendanceActivity,
  createCourseAttendanceActivity,
  getCourseAssignments,
  getCourseAttendanceActivities,
  getCourseAttendanceRecords,
  getCourseRoster,
  getCourseStudentsForGrade,
  getCourses,
  saveGrade,
  signInCourseAttendance,
  updateCourseAttendanceStudentRecord,
} from '@/api'
import StatusTag from '@/components/StatusTag'
import { isStudent as isStudentRole } from '@/lib/permissions'
import {
  canStudentSignIn,
  getGeolocationErrorMessage,
  getLocationPermissionHint,
  getSignInPhaseLabel,
  hasUsableLocationPermission,
  shouldRequestLocationPermission,
  type LocationPermissionStatus,
  type SignInPhase,
} from '@/lib/attendance'
import {
  canManageCourse,
  formatAttendanceStats,
  getActivityOperationalState,
  getAttendanceStatusColor,
  getAttendanceStatusText,
  getRecordStatusOptions,
} from '@/lib/classroomManagement'
import {
  calculateGradeLetter,
  calculateGradeStats,
  canEditGrade,
  formatScore,
  getGradeTypeLabel,
  getGradeTypeOptions,
  getScoreColorType,
  getScoreLevelLabel,
  isValidScore,
} from '@/lib/gradeEntry'
import {
  calculateCourseAssignmentStats,
  filterAssignments,
  formatDueTime,
  formatSubmissionStats,
  getAssignmentFilterOptions,
  getAssignmentReviewStatus,
  getAssignmentReviewStatusColor,
  getAssignmentReviewStatusLabel,
  type AssignmentFilter,
} from '@/lib/assignmentReview'
import { getAttendanceStatus } from '@/lib/mobileDashboard'
import { getApiErrorMessage } from '@/lib/request'
import { useAuthStore } from '@/store/authStore'
import type {
  AttendanceActivity,
  AttendanceRecord,
  CourseAssignment,
  CourseItem,
  CourseStudent,
  CreateActivityPayload,
} from '@/types'

interface StudentGradeInfo {
  student_id: number
  student_name: string
  student_number: string
  grade_id: number | null
  score: number | null
  grade_letter: string | null
  grade_type: string | null
  is_published: boolean
}

type SignInState = {
  activityId: number
  phase: SignInPhase
}

type ManagementTab = 'attendance' | 'roster' | 'records' | 'grades' | 'assignments'

const CourseDetailPage = () => {
  const { courseId } = useParams()
  const [searchParams] = useSearchParams()
  const user = useAuthStore((state) => state.user)
  const isStudent = isStudentRole(user?.role)
  const isTeacher = canManageCourse(user?.role || '')
  const id = Number(courseId)
  const focusedAttendanceId = Number(searchParams.get('attendance') || 0)
  const [course, setCourse] = useState<CourseItem | null>(null)
  const [activities, setActivities] = useState<AttendanceActivity[]>([])
  const [assignments, setAssignments] = useState<CourseAssignment[]>([])
  const [students, setStudents] = useState<CourseStudent[]>([])
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [gradeStudents, setGradeStudents] = useState<StudentGradeInfo[]>([])
  const [selectedActivity, setSelectedActivity] = useState<AttendanceActivity | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [signInState, setSignInState] = useState<SignInState | null>(null)
  const [activeTab, setActiveTab] = useState<ManagementTab>('attendance')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState<CreateActivityPayload>({
    title: '',
    start_time: '',
    end_time: '',
    location_name: '',
    latitude: 0,
    longitude: 0,
    radius_meters: 200,
  })
  const [creating, setCreating] = useState(false)
  const [closingId, setClosingId] = useState<number | null>(null)
  const [reviewingKey, setReviewingKey] = useState<string | null>(null)
  const [savingGradeId, setSavingGradeId] = useState<number | null>(null)
  const [gradeLoading, setGradeLoading] = useState(false)
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>('all')

  const focusedActivityTitle = useMemo(
    () => activities.find((activity) => activity.id === focusedAttendanceId)?.title,
    [activities, focusedAttendanceId],
  )

  const gradeStats = useMemo(() => calculateGradeStats(gradeStudents), [gradeStudents])

  const assignmentStats = useMemo(() => calculateCourseAssignmentStats(assignments), [assignments])
  const filteredAssignments = useMemo(() => filterAssignments(assignments, assignmentFilter), [assignments, assignmentFilter])

  useEffect(() => {
    let mounted = true

    const load = async () => {
      setLoading(true)
      setMessage('')
      const [courseResult, activityResult, assignmentResult] = await Promise.allSettled([
        getCourses(),
        getCourseAttendanceActivities(id),
        getCourseAssignments(id),
      ])

      if (!mounted) return

      if (courseResult.status === 'fulfilled') {
        setCourse((courseResult.value.data.data || []).find((item) => item.id === id) || null)
      }
      if (activityResult.status === 'fulfilled') {
        setActivities(activityResult.value.data.data || [])
      }
      if (assignmentResult.status === 'fulfilled') {
        setAssignments(assignmentResult.value.data.data || [])
      }
      if ([courseResult, activityResult, assignmentResult].some((result) => result.status === 'rejected')) {
        setMessage('部分课程数据暂时不可用，已展示可加载内容。')
      }
      setLoading(false)
    }

    if (id) {
      void load().catch((err) => {
        if (mounted) {
          setMessage(getApiErrorMessage(err, '课程详情加载失败'))
          setLoading(false)
        }
      })
    }

    return () => {
      mounted = false
    }
  }, [id])

  useEffect(() => {
    if (isTeacher && id) {
      loadRoster()
    }
  }, [isTeacher, id])

  const loadRoster = async () => {
    try {
      const response = await getCourseRoster(id)
      setStudents(response.data.data || [])
    } catch {
      // 静默处理，不影响主流程
    }
  }

  const loadGradeStudents = async () => {
    setGradeLoading(true)
    try {
      const response = await getCourseStudentsForGrade(id)
      setGradeStudents(response.data.data || [])
    } catch (err) {
      setMessage(getApiErrorMessage(err, '加载成绩列表失败'))
    } finally {
      setGradeLoading(false)
    }
  }

  const refreshActivities = async () => {
    const response = await getCourseAttendanceActivities(id)
    setActivities(response.data.data || [])
  }

  const loadRecords = async (activity: AttendanceActivity) => {
    try {
      const response = await getCourseAttendanceRecords(activity.id)
      setSelectedActivity(activity)
      setRecords(response.data.data?.records || [])
      setActiveTab('records')
    } catch (err) {
      setMessage(getApiErrorMessage(err, '签到明细加载失败'))
    }
  }

  const ensureLocationPermission = async () => {
    let permission: LocationPermissionStatus | null = null
    try {
      permission = await Geolocation.checkPermissions()
    } catch {
      return true
    }

    if (shouldRequestLocationPermission(permission)) {
      setMessage(getLocationPermissionHint(permission))
      try {
        permission = await Geolocation.requestPermissions({ permissions: ['location'] })
      } catch {
        return true
      }
    }

    const hint = getLocationPermissionHint(permission)
    if (hint) setMessage(hint)
    return hasUsableLocationPermission(permission)
  }

  const handleRefresh = async () => {
    setSignInState({ activityId: 0, phase: 'refreshing' })
    setMessage('')
    try {
      await refreshActivities()
      setMessage('签到状态已刷新。')
    } catch (err) {
      setMessage(getApiErrorMessage(err, '签到状态刷新失败'))
    } finally {
      setSignInState(null)
    }
  }

  const handleSignIn = async (activity: AttendanceActivity) => {
    setSignInState({ activityId: activity.id, phase: 'locating' })
    setMessage('正在获取当前位置，请保持 App 在前台。')
    try {
      const canUseLocation = await ensureLocationPermission()
      if (!canUseLocation) return

      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000 })
      setSignInState({ activityId: activity.id, phase: 'submitting' })
      setMessage('定位成功，正在提交签到。')
      await signInCourseAttendance(activity.id, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      })
      setSignInState({ activityId: activity.id, phase: 'refreshing' })
      setMessage('签到已提交，正在刷新状态。')
      await refreshActivities()
      setMessage('签到已完成。')
    } catch (err) {
      setMessage(getApiErrorMessage(err, getGeolocationErrorMessage(err)))
      await refreshActivities().catch(() => undefined)
    } finally {
      setSignInState(null)
    }
  }

  const handleCreateActivity = async () => {
    if (!createForm.title || !createForm.start_time || !createForm.end_time) {
      setMessage('请填写签到名称和时间。')
      return
    }
    setCreating(true)
    try {
      await createCourseAttendanceActivity(id, createForm)
      setShowCreateForm(false)
      setMessage('签到活动已创建。')
      await refreshActivities()
      setCreateForm({
        title: '',
        start_time: '',
        end_time: '',
        location_name: '',
        latitude: 0,
        longitude: 0,
        radius_meters: 200,
      })
    } catch (err) {
      setMessage(getApiErrorMessage(err, '创建签到活动失败'))
    } finally {
      setCreating(false)
    }
  }

  const handleCloseActivity = async (activity: AttendanceActivity) => {
    setClosingId(activity.id)
    try {
      await closeCourseAttendanceActivity(activity.id)
      setMessage('签到活动已结束。')
      await refreshActivities()
    } catch (err) {
      setMessage(getApiErrorMessage(err, '结束签到失败'))
    } finally {
      setClosingId(null)
    }
  }

  const handleReviewRecord = async (record: AttendanceRecord, status: string) => {
    if (!selectedActivity) return
    const reviewKey = `${selectedActivity.id}-${record.student_id}-${status}`
    setReviewingKey(reviewKey)
    try {
      await updateCourseAttendanceStudentRecord(selectedActivity.id, record.student_id, {
        status,
        remark: record.remark || `教师标记${getAttendanceStatusText(status as any)}`,
      })
      setMessage('签到记录已更新。')
      await loadRecords(selectedActivity)
      await refreshActivities()
    } catch (err) {
      setMessage(getApiErrorMessage(err, '签到记录更新失败'))
    } finally {
      setReviewingKey(null)
    }
  }

  const handleFillCurrentLocation = async () => {
    try {
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000 })
      setCreateForm((prev) => ({
        ...prev,
        latitude: Number(position.coords.latitude.toFixed(6)),
        longitude: Number(position.coords.longitude.toFixed(6)),
      }))
      setMessage('已填入当前位置。')
    } catch {
      setMessage('定位失败，请检查定位权限。')
    }
  }

  const handleScoreChange = (studentId: number, value: string) => {
    const score = value === '' ? null : Number(value)
    setGradeStudents((prev) =>
      prev.map((s) =>
        s.student_id === studentId
          ? { ...s, score, grade_letter: calculateGradeLetter(score) }
          : s,
      ),
    )
  }

  const handleSaveGrade = async (student: StudentGradeInfo) => {
    if (!isValidScore(student.score)) {
      setMessage('请输入有效分数（0-100）。')
      return
    }
    setSavingGradeId(student.student_id)
    try {
      await saveGrade({
        student_id: student.student_id,
        course_id: id,
        score: student.score!,
        grade_type: student.grade_type || 'final',
        is_published: student.is_published,
      })
      setMessage(`已保存 ${student.student_name} 的成绩。`)
      await loadGradeStudents()
    } catch (err) {
      setMessage(getApiErrorMessage(err, '保存成绩失败'))
    } finally {
      setSavingGradeId(null)
    }
  }

  const handlePublishToggle = async (student: StudentGradeInfo) => {
    if (student.grade_id === null) {
      setMessage('请先保存成绩再发布。')
      return
    }
    setSavingGradeId(student.student_id)
    try {
      await saveGrade({
        student_id: student.student_id,
        course_id: id,
        score: student.score!,
        grade_type: student.grade_type || 'final',
        is_published: !student.is_published,
      })
      setMessage(student.is_published ? `已取消发布 ${student.student_name} 的成绩。` : `已发布 ${student.student_name} 的成绩。`)
      await loadGradeStudents()
    } catch (err) {
      setMessage(getApiErrorMessage(err, '操作失败'))
    } finally {
      setSavingGradeId(null)
    }
  }

  const handleTabChange = (tab: ManagementTab) => {
    setActiveTab(tab)
    if (tab === 'grades' && isTeacher) {
      loadGradeStudents()
    }
  }

  const isRefreshing = signInState?.phase === 'refreshing'

  return (
    <div className="page-stack">
      <section className="hero-card compact">
        <span className="eyebrow">{course?.code || 'Course'}</span>
        <h2>{course?.name || '课程详情'}</h2>
        <p>
          {course?.teacher_name || '未配置教师'} · {course?.location || '未设置地点'}
        </p>
      </section>
      {loading ? <div className="notice-line">正在同步课程详情...</div> : null}
      {focusedActivityTitle && !message ? <div className="notice-line">已定位到：{focusedActivityTitle}</div> : null}
      {message ? <div className="notice-line">{message}</div> : null}

      {/* 教师管理标签页 */}
      {isTeacher ? (
        <section className="section-card">
          <div className="mobile-segmented">
            <button className={activeTab === 'attendance' ? 'active' : ''} onClick={() => handleTabChange('attendance')}>
              签到管理
            </button>
            <button className={activeTab === 'roster' ? 'active' : ''} onClick={() => handleTabChange('roster')}>
              学生名单
            </button>
            <button className={activeTab === 'records' ? 'active' : ''} onClick={() => handleTabChange('records')}>
              签到明细
            </button>
            <button className={activeTab === 'grades' ? 'active' : ''} onClick={() => handleTabChange('grades')}>
              成绩录入
            </button>
            <button className={activeTab === 'assignments' ? 'active' : ''} onClick={() => handleTabChange('assignments')}>
              作业批阅
            </button>
          </div>
        </section>
      ) : null}

      {/* 签到管理 Tab */}
      {(!isTeacher || activeTab === 'attendance') && (
        <section className="section-card">
          <div className="section-head">
            <h3>课程签到</h3>
            <div className="section-actions">
              {isTeacher ? (
                <button className="small-button" onClick={() => setShowCreateForm(!showCreateForm)}>
                  {showCreateForm ? '取消' : '发布签到'}
                </button>
              ) : null}
              <button className="text-button" disabled={Boolean(signInState)} onClick={handleRefresh}>
                {isRefreshing ? '刷新中' : '刷新状态'}
              </button>
              {!isTeacher ? <Link to="/home">返回首页</Link> : null}
            </div>
          </div>

          {/* 创建签到表单 */}
          {showCreateForm && isTeacher ? (
            <div className="compact-form" style={{ marginBottom: 16 }}>
              <label>
                签到名称
                <input
                  type="text"
                  value={createForm.title}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="例如：第 8 周课堂签到"
                />
              </label>
              <div className="form-grid">
                <label>
                  开始时间
                  <input
                    type="datetime-local"
                    value={createForm.start_time}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, start_time: e.target.value }))}
                  />
                </label>
                <label>
                  结束时间
                  <input
                    type="datetime-local"
                    value={createForm.end_time}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, end_time: e.target.value }))}
                  />
                </label>
              </div>
              <label>
                签到地点
                <input
                  type="text"
                  value={createForm.location_name}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, location_name: e.target.value }))}
                  placeholder="例如：教学楼 A301"
                />
              </label>
              <div className="form-grid">
                <label>
                  纬度
                  <input
                    type="number"
                    step="0.000001"
                    value={createForm.latitude || ''}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, latitude: Number(e.target.value) }))}
                    placeholder="30.123456"
                  />
                </label>
                <label>
                  经度
                  <input
                    type="number"
                    step="0.000001"
                    value={createForm.longitude || ''}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, longitude: Number(e.target.value) }))}
                    placeholder="120.123456"
                  />
                </label>
              </div>
              <label>
                允许范围（米）
                <input
                  type="number"
                  min="1"
                  value={createForm.radius_meters}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, radius_meters: Number(e.target.value) }))}
                />
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="ghost-button" onClick={handleFillCurrentLocation}>
                  使用当前位置
                </button>
                <button className="primary-button" disabled={creating} onClick={handleCreateActivity}>
                  {creating ? '创建中...' : '发布签到'}
                </button>
              </div>
            </div>
          ) : null}

          {isStudent ? (
            <p className="attendance-hint">请在签到点附近打开定位后签到。若系统弹出定位权限，请选择允许。</p>
          ) : null}

          {activities.map((activity) => {
            const attendanceStatus = getAttendanceStatus(activity)
            const canSignIn = canStudentSignIn(activity, isStudent)
            const isFocused = activity.id === focusedAttendanceId
            const rowPhase = signInState?.activityId === activity.id ? signInState.phase : 'idle'
            const buttonLabel = getSignInPhaseLabel(rowPhase)
            const opState = isTeacher ? getActivityOperationalState(activity.status) : null

            return (
              <article className={`action-row attendance-row ${isFocused ? 'focus' : ''}`} key={activity.id}>
                <div>
                  <strong>
                    {activity.title}
                    {isTeacher && opState ? (
                      <StatusTag status={opState.statusType === 'active' ? 'green' : 'neutral'}>
                        {opState.statusLabel}
                      </StatusTag>
                    ) : null}
                  </strong>
                  <span>
                    {activity.start_time} - {activity.end_time}
                  </span>
                  <span>{activity.location_name || course?.location || '未设置地点'}</span>
                  {!isStudent && activity.stats ? (
                    <span>{formatAttendanceStats(activity.stats)}</span>
                  ) : null}
                </div>
                <div className="attendance-actions">
                  {isTeacher ? (
                    <>
                      <button className="small-button" onClick={() => loadRecords(activity)}>
                        查看明细
                      </button>
                      {activity.status === 'open' ? (
                        <button
                          className="danger-button"
                          style={{ minHeight: 36, padding: '0 14px' }}
                          disabled={closingId === activity.id}
                          onClick={() => handleCloseActivity(activity)}
                        >
                          {closingId === activity.id ? '结束中' : '结束签到'}
                        </button>
                      ) : null}
                    </>
                  ) : canSignIn ? (
                    <button className="small-button" disabled={Boolean(signInState)} onClick={() => handleSignIn(activity)}>
                      {buttonLabel}
                    </button>
                  ) : (
                    <StatusTag status={attendanceStatus.status}>{attendanceStatus.label}</StatusTag>
                  )}
                </div>
              </article>
            )
          })}
          {!activities.length && !loading ? <p className="empty-text">暂无签到活动</p> : null}
        </section>
      )}

      {/* 学生名单 Tab */}
      {isTeacher && activeTab === 'roster' ? (
        <section className="section-card">
          <div className="section-head">
            <h3>选课学生</h3>
            <span className="subtle-count">{students.length} 人</span>
          </div>
          {students.length > 0 ? (
            students.map((student) => (
              <article className="action-row" key={student.id}>
                <div>
                  <strong>{student.real_name}</strong>
                  <span>{student.student_id || '-'}</span>
                  <span>
                    {student.major || '-'} · {student.grade || '-'}
                  </span>
                  {student.attendance_rate != null ? (
                    <span>出勤率 {student.attendance_rate}%</span>
                  ) : null}
                </div>
                <div className="course-count">{student.attendance_rate != null ? `${student.attendance_rate}%` : '-'}</div>
              </article>
            ))
          ) : (
            <p className="empty-text">暂无学生选课</p>
          )}
        </section>
      ) : null}

      {/* 签到明细 Tab */}
      {isTeacher && activeTab === 'records' ? (
        <section className="section-card">
          <div className="section-head">
            <h3>{selectedActivity ? `${selectedActivity.title} - 签到明细` : '签到明细'}</h3>
            {selectedActivity ? (
              <StatusTag status={selectedActivity.status === 'open' ? 'green' : 'neutral'}>
                {selectedActivity.status === 'open' ? '进行中' : '已结束'}
              </StatusTag>
            ) : null}
          </div>
          {selectedActivity ? (
            <>
              <div className="metric-grid" style={{ marginBottom: 16 }}>
                <div className="metric-card">
                  <span>应到</span>
                  <strong>{selectedActivity.stats?.total || 0}</strong>
                </div>
                <div className="metric-card">
                  <span>已到</span>
                  <strong>{selectedActivity.stats?.checked_in || 0}</strong>
                </div>
                <div className="metric-card">
                  <span>缺勤</span>
                  <strong>{selectedActivity.stats?.absent || 0}</strong>
                </div>
              </div>
              {records.map((record) => (
                <article className="submission-card" key={`${record.student_id}-${record.id || 'absent'}`}>
                  <div className="submission-head">
                    <div>
                      <strong>{record.student_name}</strong>
                      <span>{record.student_no || '-'}</span>
                      <span>{record.major || '-'}</span>
                    </div>
                    <StatusTag status={getAttendanceStatusColor(record.status as any)}>
                      {record.status_display || getAttendanceStatusText(record.status as any)}
                    </StatusTag>
                  </div>
                  {record.sign_time ? <span>签到时间: {record.sign_time}</span> : null}
                  {record.distance_meters != null ? <span>距离: {Math.round(record.distance_meters)} 米</span> : null}
                  {record.remark ? <p className="feedback-text">备注: {record.remark}</p> : null}
                  {/* 教师操作按钮 */}
                  {selectedActivity.status !== 'finished' ? (
                    <div className="review-actions">
                      {getRecordStatusOptions()
                        .filter((opt) => opt.value !== record.status)
                        .map((opt) => (
                          <button
                            key={opt.value}
                            className="ghost-button"
                            disabled={reviewingKey === `${selectedActivity.id}-${record.student_id}-${opt.value}`}
                            onClick={() => handleReviewRecord(record, opt.value)}
                          >
                            {reviewingKey === `${selectedActivity.id}-${record.student_id}-${opt.value}`
                              ? '处理中'
                              : opt.label}
                          </button>
                        ))}
                    </div>
                  ) : null}
                </article>
              ))}
              {!records.length ? <p className="empty-text">暂无签到记录</p> : null}
            </>
          ) : (
            <p className="empty-text">请先选择一个签到活动查看明细</p>
          )}
        </section>
      ) : null}

      {/* 成绩录入 Tab */}
      {isTeacher && activeTab === 'grades' ? (
        <section className="section-card">
          <div className="section-head">
            <h3>成绩录入</h3>
            <span className="subtle-count">{gradeStudents.length} 人</span>
          </div>

          {/* 统计卡片 */}
          <div className="metric-grid" style={{ marginBottom: 16 }}>
            <div className="metric-card">
              <span>已录入</span>
              <strong>{gradeStats.entered}</strong>
            </div>
            <div className="metric-card">
              <span>已发布</span>
              <strong>{gradeStats.published}</strong>
            </div>
            <div className="metric-card">
              <span>平均分</span>
              <strong>{gradeStats.average ?? '-'}</strong>
            </div>
            <div className="metric-card">
              <span>优秀</span>
              <strong>{gradeStats.excellent}</strong>
            </div>
          </div>

          {/* 成绩类型选择 */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: '#63746e', fontWeight: 700 }}>
              成绩类型：
              <select
                className="mobile-select"
                style={{ marginLeft: 8, width: 'auto', minHeight: 36, display: 'inline-block' }}
                defaultValue="final"
              >
                {getGradeTypeOptions().map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {gradeLoading ? (
            <p className="empty-text">正在加载成绩列表...</p>
          ) : gradeStudents.length > 0 ? (
            gradeStudents.map((student) => {
              const isSaving = savingGradeId === student.student_id
              const editable = canEditGrade(student)

              return (
                <article className="submission-card" key={student.student_id}>
                  <div className="submission-head">
                    <div>
                      <strong>{student.student_name}</strong>
                      <span>{student.student_number || '-'}</span>
                    </div>
                    <StatusTag status={student.is_published ? 'green' : 'neutral'}>
                      {student.is_published ? '已发布' : '未发布'}
                    </StatusTag>
                  </div>

                  <div className="compact-form">
                    <div className="form-grid">
                      <label>
                        分数
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={student.score ?? ''}
                          onChange={(e) => handleScoreChange(student.student_id, e.target.value)}
                          disabled={!editable || isSaving}
                          placeholder="0-100"
                        />
                      </label>
                      <label>
                        等级
                        <div
                          style={{
                            minHeight: 46,
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 12px',
                            background: '#f8fbf7',
                            borderRadius: 16,
                            border: '1px solid #d9e4df',
                          }}
                        >
                          <StatusTag status={getScoreColorType(student.score)}>
                            {student.grade_letter || getScoreLevelLabel(student.score)}
                          </StatusTag>
                        </div>
                      </label>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      {editable ? (
                        <>
                          <button
                            className="small-button"
                            disabled={isSaving || !isValidScore(student.score)}
                            onClick={() => handleSaveGrade(student)}
                          >
                            {isSaving ? '保存中...' : '保存'}
                          </button>
                          {student.grade_id !== null ? (
                            <button
                              className="ghost-button"
                              disabled={isSaving}
                              onClick={() => handlePublishToggle(student)}
                            >
                              {student.is_published ? '取消发布' : '发布'}
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <span style={{ fontSize: 12, color: '#63746e', fontWeight: 700 }}>已发布，无法修改</span>
                      )}
                    </div>
                  </div>
                </article>
              )
            })
          ) : (
            <p className="empty-text">暂无学生选课</p>
          )}
        </section>
      ) : null}

      {/* 作业批阅 Tab */}
      {isTeacher && activeTab === 'assignments' ? (
        <section className="section-card">
          <div className="section-head">
            <h3>作业批阅</h3>
            <span className="subtle-count">{assignments.length} 个作业</span>
          </div>

          {/* 统计卡片 */}
          <div className="metric-grid" style={{ marginBottom: 16 }}>
            <div className="metric-card">
              <span>总作业</span>
              <strong>{assignmentStats.total}</strong>
            </div>
            <div className="metric-card">
              <span>待批阅</span>
              <strong>{assignmentStats.needsReview}</strong>
            </div>
            <div className="metric-card">
              <span>已完成</span>
              <strong>{assignmentStats.completed}</strong>
            </div>
            <div className="metric-card">
              <span>批阅率</span>
              <strong>{assignmentStats.totalSubmissions > 0 ? Math.round((assignmentStats.totalReviewed / assignmentStats.totalSubmissions) * 100) : 0}%</strong>
            </div>
          </div>

          {/* 筛选选项 */}
          <div className="mobile-segmented" style={{ marginBottom: 16 }}>
            {getAssignmentFilterOptions().map((opt) => (
              <button
                key={opt.value}
                className={assignmentFilter === opt.value ? 'active' : ''}
                onClick={() => setAssignmentFilter(opt.value)}
              >
                {opt.label}
                {opt.value === 'needs_review' && assignmentStats.needsReview > 0 ? ` (${assignmentStats.needsReview})` : ''}
              </button>
            ))}
          </div>

          {/* 作业列表 */}
          {filteredAssignments.length > 0 ? (
            filteredAssignments.map((assignment) => {
              const reviewStatus = getAssignmentReviewStatus(assignment)
              const statusLabel = getAssignmentReviewStatusLabel(reviewStatus)
              const statusColor = getAssignmentReviewStatusColor(reviewStatus)

              return (
                <Link className="list-row" key={assignment.id} to={`/assignments/${assignment.id}`}>
                  <div>
                    <strong>
                      {assignment.title}
                      <StatusTag status={statusColor}>{statusLabel}</StatusTag>
                    </strong>
                    <span>{formatDueTime(assignment.due_time)}</span>
                    {assignment.stats ? (
                      <span>{formatSubmissionStats(assignment.stats)}</span>
                    ) : null}
                  </div>
                  <span className="course-count">{assignment.stats?.submitted ?? 0}</span>
                </Link>
              )
            })
          ) : (
            <p className="empty-text">
              {assignmentFilter === 'needs_review' ? '暂无待批阅作业' : assignmentFilter === 'completed' ? '暂无已完成作业' : '暂无课程作业'}
            </p>
          )}
        </section>
      ) : null}

      {/* 课程作业 - 学生可见 */}
      {isStudent ? (
        <section className="section-card">
          <div className="section-head">
            <h3>课程作业</h3>
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
          {!assignments.length && !loading ? <p className="empty-text">暂无课程作业</p> : null}
        </section>
      ) : null}
    </div>
  )
}

export default CourseDetailPage
