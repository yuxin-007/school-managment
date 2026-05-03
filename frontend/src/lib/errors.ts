interface ApiErrorShape {
  response?: {
    data?: {
      message?: string
    }
  }
  errorFields?: unknown
  code?: number
}

export const asApiError = (error: unknown): ApiErrorShape => {
  if (error && typeof error === 'object') {
    return error as ApiErrorShape
  }
  return {}
}

export const getApiErrorMessage = (error: unknown, fallback: string) => {
  const apiError = asApiError(error)
  if (apiError.response?.data?.message) {
    return apiError.response.data.message
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

export const hasFormErrorFields = (error: unknown) => Boolean(asApiError(error).errorFields)

export const getBrowserErrorCode = (error: unknown) => asApiError(error).code
