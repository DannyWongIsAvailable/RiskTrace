export interface ApiResponse<T> {
  success: boolean
  data?: T
  code?: string
  message?: string
}

export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export async function request<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers)

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'same-origin',
  })

  let result: ApiResponse<T>

  try {
    result = (await response.json()) as ApiResponse<T>
  } catch {
    throw new ApiError('服务器返回了无法解析的响应', response.status)
  }

  if (!response.ok || !result.success) {
    throw new ApiError(
      result.message ?? `请求失败：${response.status}`,
      response.status,
      result.code,
    )
  }

  return result.data as T
}