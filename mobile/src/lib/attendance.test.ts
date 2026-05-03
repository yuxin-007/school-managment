import { describe, expect, test } from 'vitest'
import {
  canStudentSignIn,
  getGeolocationErrorMessage,
  getLocationPermissionHint,
  getSignInPhaseLabel,
  hasUsableLocationPermission,
  shouldRequestLocationPermission,
  type SignInPhase,
} from '@/lib/attendance'
import type { AttendanceActivity } from '@/types'

const openActivity: AttendanceActivity = {
  id: 1,
  course_id: 2,
  title: '课堂签到',
  start_time: '08:00',
  end_time: '08:15',
  status: 'open',
  status_display: '进行中',
}

describe('attendance helpers', () => {
  test('allows students to sign in only when activity is open and no record exists', () => {
    expect(canStudentSignIn(openActivity, true)).toBe(true)
    expect(canStudentSignIn({ ...openActivity, status: 'closed' }, true)).toBe(false)
    expect(canStudentSignIn({ ...openActivity, my_record: { id: 3, status: 'present', status_display: '已签到' } }, true)).toBe(false)
    expect(canStudentSignIn(openActivity, false)).toBe(false)
  })

  test('maps sign-in phases to short button labels', () => {
    const phases: SignInPhase[] = ['idle', 'locating', 'submitting', 'refreshing']

    expect(phases.map(getSignInPhaseLabel)).toEqual(['签到', '定位中', '提交中', '刷新中'])
  })

  test('turns geolocation errors into actionable mobile messages', () => {
    expect(getGeolocationErrorMessage({ code: 1 })).toContain('定位权限')
    expect(getGeolocationErrorMessage({ code: 2 })).toContain('无法获取')
    expect(getGeolocationErrorMessage({ code: 3 })).toContain('定位超时')
    expect(getGeolocationErrorMessage(new Error('User denied Geolocation'))).toContain('定位权限')
  })

  test('detects when location permission can be used or should be requested', () => {
    expect(hasUsableLocationPermission({ location: 'granted', coarseLocation: 'granted' })).toBe(true)
    expect(hasUsableLocationPermission({ location: 'denied', coarseLocation: 'granted' })).toBe(true)
    expect(hasUsableLocationPermission({ location: 'denied', coarseLocation: 'denied' })).toBe(false)

    expect(shouldRequestLocationPermission({ location: 'prompt', coarseLocation: 'prompt' })).toBe(true)
    expect(shouldRequestLocationPermission({ location: 'prompt-with-rationale', coarseLocation: 'prompt' })).toBe(true)
    expect(shouldRequestLocationPermission({ location: 'granted', coarseLocation: 'granted' })).toBe(false)
  })

  test('explains denied and approximate location permission states', () => {
    expect(getLocationPermissionHint({ location: 'denied', coarseLocation: 'denied' })).toContain('系统设置')
    expect(getLocationPermissionHint({ location: 'denied', coarseLocation: 'granted' })).toContain('精确定位')
    expect(getLocationPermissionHint({ location: 'granted', coarseLocation: 'granted' })).toBe('')
  })
})
