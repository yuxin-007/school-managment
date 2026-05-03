import axios, { AxiosHeaders, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/store/authStore'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''

const request = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000,
  withCredentials: true,
})

const mutatingMethods = new Set(['post', 'put', 'patch', 'delete'])

// CSRF token 管理
let csrfToken: string | null = null
let csrfPromise: Promise<string | null> | null = null

/**
 * 获取 CSRF token，支持并发请求复用同一个 promise
 */
export const getCsrfToken = async (forceRefresh = false): Promise<string | null> => {
  if (!forceRefresh && csrfToken) return csrfToken

  // 如果已有正在进行的请求，复用它
  if (!forceRefresh && csrfPromise) return csrfPromise

  csrfPromise = axios
    .get(`${apiBaseUrl}/api/csrf-token`, { withCredentials: true })
    .then((response) => {
      csrfToken = response.data?.data?.csrf_token || null
      return csrfToken
    })
    .catch(() => {
      csrfToken = null
      return null
    })
    .finally(() => {
      csrfPromise = null
    })

  return csrfPromise
}

/**
 * 清空 CSRF token 缓存
 */
export const clearCsrfToken = () => {
  csrfToken = null
  csrfPromise = null
}

/**
 * 判断是否为 CSRF 相关错误
 */
const isCsrfError = (error: unknown): boolean => {
  if (!axios.isAxiosError(error)) return false
  const status = error.response?.status
  const message = String(error.response?.data?.message || '')
  return status === 400 && message.includes('CSRF')
}

// 标记正在重试的请求，避免无限重试
const retryingRequests = new WeakSet<InternalAxiosRequestConfig>()

// 请求拦截器：为 mutating 请求注入 CSRF token
request.interceptors.request.use(async (config) => {
  const method = (config.method || 'get').toLowerCase()
  if (mutatingMethods.has(method)) {
    const token = await getCsrfToken()
    if (token) {
      const headers = AxiosHeaders.from(config.headers)
      headers.set('X-CSRFToken', token)
      config.headers = headers
    }
  }
  return config
})

// 响应拦截器：处理成功/失败，CSRF 错误自动重试一次
request.interceptors.response.use(
  (response) => {
    if (response.data?.success === false) {
      return Promise.reject(new Error(response.data.message || '请求失败'))
    }
    return response
  },
  async (error) => {
    const originalConfig = error.config as InternalAxiosRequestConfig | undefined

    // CSRF 错误：清空 token，重新获取，重试一次
    if (isCsrfError(error) && originalConfig && !retryingRequests.has(originalConfig)) {
      retryingRequests.add(originalConfig)
      clearCsrfToken()

      const newToken = await getCsrfToken(true)
      if (newToken) {
        const headers = AxiosHeaders.from(originalConfig.headers)
        headers.set('X-CSRFToken', newToken)
        originalConfig.headers = headers
        return request(originalConfig)
      }
    }

    // 401 错误：登出
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
    }

    return Promise.reject(error)
  },
)

export const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || error.message || fallback
  }
  if (error instanceof Error) return error.message || fallback
  return fallback
}

export default request
