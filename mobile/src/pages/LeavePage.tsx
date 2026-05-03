import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  approveLeaveApplication,
  cancelLeaveApplication,
  createLeaveApplication,
  getLeaveApplications,
  getLeaveTypes,
  getPendingLeaveApplications,
  rejectLeaveApplication,
} from '@/api'
import StatusTag from '@/components/StatusTag'
import {
  calculateLeaveDays,
  getFocusedLeaveApplicationId,
  getLeaveStepTitle,
  getNextLeaveStep,
  getPreviousLeaveStep,
  isFocusedLeaveApplication,
  validateLeaveStep,
  type LeaveDraft,
  type LeaveStep,
} from '@/lib/leaveFlow'
import { canApproveLeave } from '@/lib/permissions'
import { getApiErrorMessage } from '@/lib/request'
import { useAuthStore } from '@/store/authStore'
import type { LeaveApplication, LeaveTypeOption } from '@/types'

const today = new Date().toISOString().slice(0, 10)

const initialForm: LeaveDraft = {
  leave_type: 'personal_leave',
  start_date: today,
  end_date: today,
  reason: '',
  emergency_contact: '',
  emergency_phone: '',
}

const LeavePage = () => {
  const [searchParams] = useSearchParams()
  const user = useAuthStore((state) => state.user)
  const [types, setTypes] = useState<LeaveTypeOption[]>([])
  const [applications, setApplications] = useState<LeaveApplication[]>([])
  const [pending, setPending] = useState<LeaveApplication[]>([])
  const [form, setForm] = useState<LeaveDraft>(initialForm)
  const [step, setStep] = useState<LeaveStep>(0)
  const [comments, setComments] = useState<Record<number, string>>({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const applicationRefs = useRef<Record<number, HTMLElement | null>>({})

  const canApprove = canApproveLeave(user?.role)
  const focusedApplicationId = getFocusedLeaveApplicationId(searchParams.get('application'))
  const hasFocusedApplication = useMemo(
    () => focusedApplicationId > 0 && [...applications, ...pending].some((item) => item.id === focusedApplicationId),
    [applications, focusedApplicationId, pending],
  )
  const selectedTypeLabel = types.find((item) => item.value === form.leave_type)?.label || '请假'
  const leaveDays = calculateLeaveDays(form.start_date, form.end_date)

  const load = async () => {
    const [typeResponse, applicationResponse] = await Promise.all([getLeaveTypes(), getLeaveApplications()])
    setTypes(typeResponse.data.data || [])
    setApplications(applicationResponse.data.data || [])
    if (canApprove) {
      const pendingResponse = await getPendingLeaveApplications()
      setPending(pendingResponse.data.data || [])
    }
  }

  useEffect(() => {
    void load().catch((err) => setError(getApiErrorMessage(err, '请假数据加载失败')))
  }, [canApprove])

  useEffect(() => {
    if (!hasFocusedApplication) return
    applicationRefs.current[focusedApplicationId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusedApplicationId, hasFocusedApplication])

  const updateForm = (field: keyof LeaveDraft, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleNext = () => {
    const validation = validateLeaveStep(step, form)
    if (validation) {
      setError(validation)
      return
    }
    setError('')
    setStep(getNextLeaveStep(step))
  }

  const handleSubmit = async () => {
    const firstStepError = validateLeaveStep(0, form)
    const secondStepError = validateLeaveStep(1, form)
    if (firstStepError || secondStepError) {
      setError(firstStepError || secondStepError)
      setStep(firstStepError ? 0 : 1)
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await createLeaveApplication({
        ...form,
        reason: form.reason.trim(),
        emergency_contact: form.emergency_contact.trim(),
        emergency_phone: form.emergency_phone.trim(),
      })
      setMessage('请假申请已提交')
      setForm({ ...initialForm, leave_type: types[0]?.value || initialForm.leave_type })
      setStep(0)
      await load()
    } catch (err) {
      setError(getApiErrorMessage(err, '提交失败'))
    } finally {
      setSaving(false)
    }
  }

  const handleReview = async (application: LeaveApplication, action: 'approve' | 'reject') => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const note = comments[application.id] || ''
      if (action === 'approve') {
        await approveLeaveApplication(application.id, note)
        setMessage('已批准请假申请')
      } else {
        await rejectLeaveApplication(application.id, note)
        setMessage('已驳回请假申请')
      }
      await load()
    } catch (err) {
      setError(getApiErrorMessage(err, '审批失败'))
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async (application: LeaveApplication) => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await cancelLeaveApplication(application.id)
      setMessage('请假申请已取消')
      await load()
    } catch (err) {
      setError(getApiErrorMessage(err, '取消失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-stack">
      <section className="section-title">
        <span className="eyebrow">Leave</span>
        <h2>请假</h2>
      </section>
      {message ? <div className="notice-line">{message}</div> : null}
      {hasFocusedApplication ? <div className="notice-line">已定位到相关请假申请</div> : null}
      {error ? <div className="form-error">{error}</div> : null}

      <section className="section-card compact-form">
        <div className="section-head">
          <h3>提交申请</h3>
          <span className="subtle-count">{step + 1}/3</span>
        </div>
        <div className="leave-stepper" aria-label="请假申请步骤">
          {([0, 1, 2] as LeaveStep[]).map((item) => (
            <button
              className={item === step ? 'active' : ''}
              key={item}
              type="button"
              onClick={() => setStep(item)}
            >
              <span>{item + 1}</span>
              <strong>{getLeaveStepTitle(item)}</strong>
            </button>
          ))}
        </div>

        {step === 0 ? (
          <>
            <label>
              <span>请假类型</span>
              <select className="mobile-select" value={form.leave_type} onChange={(event) => updateForm('leave_type', event.target.value)}>
                {types.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                <span>开始日期</span>
                <input type="date" value={form.start_date} onChange={(event) => updateForm('start_date', event.target.value)} />
              </label>
              <label>
                <span>结束日期</span>
                <input type="date" value={form.end_date} onChange={(event) => updateForm('end_date', event.target.value)} />
              </label>
            </div>
            <div className="leave-summary-chip">预计请假 {leaveDays} 天</div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <label>
              <span>请假原因</span>
              <textarea className="mobile-textarea" value={form.reason} onChange={(event) => updateForm('reason', event.target.value)} />
            </label>
            <div className="form-grid">
              <label>
                <span>紧急联系人</span>
                <input value={form.emergency_contact} onChange={(event) => updateForm('emergency_contact', event.target.value)} />
              </label>
              <label>
                <span>联系电话</span>
                <input inputMode="tel" value={form.emergency_phone} onChange={(event) => updateForm('emergency_phone', event.target.value)} />
              </label>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <div className="leave-confirm">
            <div>
              <span>类型</span>
              <strong>{selectedTypeLabel}</strong>
            </div>
            <div>
              <span>时间</span>
              <strong>
                {form.start_date} 至 {form.end_date}
              </strong>
            </div>
            <div>
              <span>天数</span>
              <strong>{leaveDays} 天</strong>
            </div>
            <p>{form.reason || '未填写原因'}</p>
          </div>
        ) : null}

        <div className="leave-actions">
          {step > 0 ? (
            <button className="ghost-button" disabled={saving} onClick={() => setStep(getPreviousLeaveStep(step))}>
              上一步
            </button>
          ) : null}
          {step < 2 ? (
            <button className="primary-button" disabled={saving} onClick={handleNext}>
              下一步
            </button>
          ) : (
            <button className="primary-button" disabled={saving} onClick={handleSubmit}>
              {saving ? '提交中' : '确认提交'}
            </button>
          )}
        </div>
      </section>

      {canApprove ? (
        <section className="section-card">
          <div className="section-head">
            <h3>待我审批</h3>
            <span className="subtle-count">{pending.length}</span>
          </div>
          {pending.map((application) => (
            <article
              className={`submission-card leave-application-row ${isFocusedLeaveApplication(application.id, focusedApplicationId) ? 'focus' : ''}`}
              key={application.id}
              ref={(node) => {
                applicationRefs.current[application.id] = node
              }}
            >
              <div className="submission-head">
                <div>
                  <strong>{application.staff_name}</strong>
                  <span>
                    {application.leave_type_display} · {application.start_date} 至 {application.end_date}
                  </span>
                </div>
                <StatusTag status={application.status}>{application.status_display}</StatusTag>
              </div>
              <p className="rich-text">{application.reason}</p>
              <textarea
                className="mobile-textarea compact"
                placeholder="审批意见"
                value={comments[application.id] || ''}
                onChange={(event) => setComments((current) => ({ ...current, [application.id]: event.target.value }))}
              />
              <div className="review-actions">
                <button className="small-button" disabled={saving} onClick={() => handleReview(application, 'approve')}>
                  批准
                </button>
                <button className="ghost-button" disabled={saving} onClick={() => handleReview(application, 'reject')}>
                  驳回
                </button>
              </div>
            </article>
          ))}
          {!pending.length && <p className="empty-text">暂无待审批申请</p>}
        </section>
      ) : null}

      <section className="section-card">
        <div className="section-head">
          <h3>我的申请</h3>
        </div>
        {applications.map((application) => (
          <article
            className={`action-row leave-application-row ${isFocusedLeaveApplication(application.id, focusedApplicationId) ? 'focus' : ''}`}
            key={application.id}
            ref={(node) => {
              applicationRefs.current[application.id] = node
            }}
          >
            <div>
              <strong>{application.leave_type_display}</strong>
              <span>
                {application.start_date} 至 {application.end_date} · {application.total_days} 天
              </span>
              <span>审批人：{application.current_approver_name || application.approver_name || '-'}</span>
            </div>
            {application.status === 'pending' ? (
              <button className="ghost-button" disabled={saving} onClick={() => handleCancel(application)}>
                取消
              </button>
            ) : (
              <StatusTag status={application.status}>{application.status_display}</StatusTag>
            )}
          </article>
        ))}
        {!applications.length && <p className="empty-text">暂无请假申请</p>}
      </section>
    </div>
  )
}

export default LeavePage
