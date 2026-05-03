import { describe, expect, test } from 'vitest'
import {
  calculateLeaveDays,
  getFocusedLeaveApplicationId,
  getLeaveStepTitle,
  getNextLeaveStep,
  isFocusedLeaveApplication,
  validateLeaveStep,
  type LeaveDraft,
} from '@/lib/leaveFlow'

const draft: LeaveDraft = {
  leave_type: 'personal_leave',
  start_date: '2026-04-30',
  end_date: '2026-05-02',
  reason: '家中有事需要处理',
  emergency_contact: '张三',
  emergency_phone: '13800138000',
}

describe('leave flow helpers', () => {
  test('calculates inclusive leave days', () => {
    expect(calculateLeaveDays('2026-04-30', '2026-04-30')).toBe(1)
    expect(calculateLeaveDays('2026-04-30', '2026-05-02')).toBe(3)
    expect(calculateLeaveDays('2026-05-03', '2026-05-02')).toBe(0)
  })

  test('validates each step before moving forward', () => {
    expect(validateLeaveStep(0, { ...draft, leave_type: '' })).toBe('请选择请假类型')
    expect(validateLeaveStep(0, { ...draft, end_date: '2026-04-29' })).toBe('结束日期不能早于开始日期')
    expect(validateLeaveStep(1, { ...draft, reason: '太短' })).toBe('请填写至少 5 个字的请假原因')
    expect(validateLeaveStep(1, { ...draft, emergency_phone: '123' })).toBe('请填写有效的联系电话')
    expect(validateLeaveStep(2, draft)).toBe('')
  })

  test('moves through the mobile leave steps', () => {
    expect(getLeaveStepTitle(0)).toBe('类型与时间')
    expect(getLeaveStepTitle(1)).toBe('原因与联系人')
    expect(getLeaveStepTitle(2)).toBe('确认提交')
    expect(getNextLeaveStep(0)).toBe(1)
    expect(getNextLeaveStep(2)).toBe(2)
  })

  test('parses and matches focused leave application ids from notifications', () => {
    expect(getFocusedLeaveApplicationId('12')).toBe(12)
    expect(getFocusedLeaveApplicationId('0')).toBe(0)
    expect(getFocusedLeaveApplicationId('1e2')).toBe(0)
    expect(getFocusedLeaveApplicationId('abc')).toBe(0)
    expect(getFocusedLeaveApplicationId(null)).toBe(0)

    expect(isFocusedLeaveApplication(12, 12)).toBe(true)
    expect(isFocusedLeaveApplication(13, 12)).toBe(false)
    expect(isFocusedLeaveApplication(12, 0)).toBe(false)
  })
})
