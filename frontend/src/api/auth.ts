import request from '@/lib/request'
import type { UserInfo } from '@/store/authStore'

// 登录
export const login = (data: { username: string; password: string }) =>
  request.post('/auth/login', data)

export type RecoveryPurpose = 'reset_password' | 'email_login' | 'phone_login'
export type RecoveryContactType = 'email' | 'phone'

export const sendRecoveryCode = (data: {
  purpose: RecoveryPurpose
  contact_type: RecoveryContactType
  contact: string
}) => request.post('/auth/recovery/send-code', data)

export const resetPasswordWithCode = (data: {
  contact_type: RecoveryContactType
  contact: string
  code: string
  new_password: string
  confirm_password: string
}) => request.post('/auth/recovery/reset-password', data)

export const loginWithRecoveryCode = (data: {
  contact_type: RecoveryContactType
  contact: string
  code: string
}) => request.post('/auth/recovery/login', data)

// 登出
export const logout = () => request.get('/auth/logout')

// 获取当前用户信息
export const getProfile = () =>
  request.get<{ success: boolean; data: UserInfo }>('/user/api/profile')

// 更新个人信息
export const updateProfile = (data: Partial<UserInfo> & { email_code?: string; phone_code?: string }) =>
  request.put('/user/api/profile', data)

export const sendContactCode = (data: {
  contact_type: 'email' | 'phone'
  contact: string
}) => request.post('/user/api/contact-code', data)

// 修改密码
export const changePassword = (data: {
  current_password: string
  new_password: string
  confirm_password: string
}) => request.post('/user/api/change_password', data)

// 获取/更新用户偏好
export const getPreferences = () => request.get('/user/api/preferences')
export const updatePreferences = (data: {
  theme?: 'light' | 'dark' | 'auto'
  language?: 'zh-CN' | 'en'
  notification_preferences?: {
    leave?: boolean
    attendance?: boolean
    announcement?: boolean
    grade?: boolean
    course?: boolean
    system?: boolean
  }
}) =>
  request.put('/user/api/preferences', data)
