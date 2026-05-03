import type { AttendanceActivity } from '@/types'

export type SignInPhase = 'idle' | 'locating' | 'submitting' | 'refreshing'
export type LocationPermissionState = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied' | string
export type LocationPermissionStatus = {
  location?: LocationPermissionState
  coarseLocation?: LocationPermissionState
}

const phaseLabel: Record<SignInPhase, string> = {
  idle: '签到',
  locating: '定位中',
  submitting: '提交中',
  refreshing: '刷新中',
}

export function canStudentSignIn(activity: AttendanceActivity, isStudent: boolean) {
  return isStudent && activity.status === 'open' && !activity.my_record?.status
}

export function getSignInPhaseLabel(phase: SignInPhase) {
  return phaseLabel[phase]
}

export function getGeolocationErrorMessage(error: unknown, fallback = '签到失败，请检查定位权限') {
  const maybeError = error as { code?: unknown; message?: unknown } | null | undefined
  const code = typeof maybeError?.code === 'number' ? maybeError.code : undefined

  if (code === 1) return '定位权限未开启，请在系统设置中允许 App 使用定位后重试。'
  if (code === 2) return '暂时无法获取当前位置，请确认定位服务和网络可用后重试。'
  if (code === 3) return '定位超时，请到室外或网络更稳定的位置后重试。'

  const message = typeof maybeError?.message === 'string' ? maybeError.message.toLowerCase() : ''
  if (message.includes('denied') || message.includes('permission')) {
    return '定位权限未开启，请在系统设置中允许 App 使用定位后重试。'
  }
  if (message.includes('timeout')) {
    return '定位超时，请到室外或网络更稳定的位置后重试。'
  }

  return fallback
}

export function hasUsableLocationPermission(status: LocationPermissionStatus | null | undefined) {
  return status?.location === 'granted' || status?.coarseLocation === 'granted'
}

export function shouldRequestLocationPermission(status: LocationPermissionStatus | null | undefined) {
  return status?.location === 'prompt' || status?.location === 'prompt-with-rationale' || status?.coarseLocation === 'prompt'
}

export function getLocationPermissionHint(status: LocationPermissionStatus | null | undefined) {
  if (!status) return ''
  if (status.location === 'denied' && status.coarseLocation === 'denied') {
    return '定位权限已被拒绝，请在系统设置中允许 App 使用定位后重试。'
  }
  if (status.location !== 'granted' && status.coarseLocation === 'granted') {
    return '当前可能仅开启了模糊定位，若签到范围较小，请在系统设置中开启精确定位。'
  }
  if (shouldRequestLocationPermission(status)) {
    return '签到需要定位权限，请在系统弹窗中选择允许。'
  }
  return ''
}
