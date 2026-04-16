import axios from 'axios'
import { message } from 'antd'
import { useAuthStore } from '@/store/authStore'

declare module 'axios' {
  interface AxiosRequestConfig {
    skipErrorMessage?: boolean
  }
}

const request = axios.create({
  timeout: 15000,
  withCredentials: true,
})

request.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error),
)

request.interceptors.response.use(
  (response) => {
    const data = response.data
    if (data && data.success === false) {
      if (!response.config.skipErrorMessage) {
        message.error(data.message || '请求处理失败。')
      }
      return Promise.reject(new Error(data.message))
    }
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      if (window.location.pathname !== '/login') {
        window.history.pushState(null, '', '/login')
        window.dispatchEvent(new PopStateEvent('popstate'))
      }
    } else if (error.config?.skipErrorMessage) {
      return Promise.reject(error)
    } else if (error.response?.status === 403) {
      message.error(error.response?.data?.message || '当前账号权限不足。')
    } else if (error.response) {
      message.error(error.response?.data?.message || '请求失败，请稍后再试。')
    } else {
      message.error('网络连接失败，请检查服务是否启动。')
    }
    return Promise.reject(error)
  },
)

export default request
