import request from '@/lib/request'
import type { UserInfo } from '@/store/authStore'

// 登录
export const login = (data: { username: string; password: string }) =>
  request.post('/auth/login', data)

// 登出
export const logout = () => request.get('/auth/logout')

// 获取当前用户信息
export const getProfile = () =>
  request.get<{ success: boolean; data: UserInfo }>('/user/api/profile')

// 更新个人信息
export const updateProfile = (data: Partial<UserInfo>) =>
  request.put('/user/api/profile', data)

// 修改密码
export const changePassword = (data: {
  current_password: string
  new_password: string
  confirm_password: string
}) => request.post('/user/api/change_password', data)

// 获取/更新用户偏好
export const getPreferences = () => request.get('/api/user/preferences')
export const updatePreferences = (data: { theme?: string; language?: string }) =>
  request.put('/api/user/preferences', data)
