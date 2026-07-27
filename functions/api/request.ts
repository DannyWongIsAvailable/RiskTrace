interface ApiSuccess<T> {
  success: true
  data: T
}

interface ApiFailure {
  success: false
  code: string
  message: string
}

type ApiResponse<T> =
  | ApiSuccess<T>
  | ApiFailure

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(
    message: string,
    status: number,
    code = 'REQUEST_FAILED',
  ) {
    super(message)

    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export async function request<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)

  if (
    init.body
    && !(init.body instanceof FormData)
    && !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(url, {
    ...init,
    headers,
    credentials: 'same-origin',
  })

  let result: ApiResponse<T>

  try {
    result = await response.json() as ApiResponse<T>
  } catch {
    throw new ApiError(
      '服务器响应格式错误',
      response.status,
      'INVALID_RESPONSE',
    )
  }

  if (!response.ok || !result.success) {
    const failure = result as ApiFailure

    throw new ApiError(
      failure.message || '请求失败',
      response.status,
      failure.code,
    )
  }

  return result.data
}