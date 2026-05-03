export type LeaveDraft = {
  leave_type: string
  start_date: string
  end_date: string
  reason: string
  emergency_contact: string
  emergency_phone: string
}

export type LeaveStep = 0 | 1 | 2

const stepTitles = ['类型与时间', '原因与联系人', '确认提交'] as const
const phonePattern = /^[0-9+\-\s]{6,20}$/

export function calculateLeaveDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
}

export function getLeaveStepTitle(step: LeaveStep) {
  return stepTitles[step]
}

export function getNextLeaveStep(step: LeaveStep): LeaveStep {
  return Math.min(step + 1, 2) as LeaveStep
}

export function getPreviousLeaveStep(step: LeaveStep): LeaveStep {
  return Math.max(step - 1, 0) as LeaveStep
}

export function validateLeaveStep(step: LeaveStep, draft: LeaveDraft) {
  if (step === 0) {
    if (!draft.leave_type) return '请选择请假类型'
    if (!draft.start_date || !draft.end_date) return '请选择请假日期'
    if (calculateLeaveDays(draft.start_date, draft.end_date) < 1) return '结束日期不能早于开始日期'
  }

  if (step === 1) {
    if (draft.reason.trim().length < 5) return '请填写至少 5 个字的请假原因'
    if (draft.emergency_phone.trim() && !phonePattern.test(draft.emergency_phone.trim())) {
      return '请填写有效的联系电话'
    }
  }

  return ''
}

export function getFocusedLeaveApplicationId(rawId: string | null | undefined) {
  if (!rawId || !/^[1-9]\d*$/.test(rawId)) return 0
  const id = Number(rawId)
  return Number.isSafeInteger(id) ? id : 0
}

export function isFocusedLeaveApplication(applicationId: number, focusedId: number) {
  return focusedId > 0 && applicationId === focusedId
}
