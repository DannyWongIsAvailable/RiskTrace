import type { ApiFailure, ApiResponse } from '@/types/api'

type QueryPrimitive = string | number | boolean | null | undefined
export type QueryValue = QueryPrimitive | QueryPrimitive[]
export type QueryParams = Record<string, QueryValue>

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  query?: QueryParams
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 15_000
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(message: string, status: number, code = 'REQUEST_FAILED', details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

function buildUrl(path: string, query?: QueryParams): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = new URL(`${API_BASE_URL}${normalizedPath}`, window.location.origin)

  if (!query) {
    return url.toString()
  }

  Object.entries(query).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== null && item !== undefined) {
          url.searchParams.append(key, String(item))
        }
      })
      return
    }

    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value))
    }
  })

  return url.toString()
}

function createAbortController(signal: AbortSignal | null | undefined, timeoutMs: number) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  if (signal) {
    if (signal.aborted) {
      controller.abort()
    } else {
      signal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }

  return { controller, timeoutId }
}

function normalizeBody(body: unknown, headers: Headers): BodyInit | undefined {
  if (body === undefined || body === null) {
    return undefined
  }

  if (body instanceof FormData || body instanceof URLSearchParams || body instanceof Blob) {
    return body
  }

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  return JSON.stringify(body)
}

async function parseResponse<T>(response: Response): Promise<ApiResponse<T> | undefined> {
  if (response.status === 204) {
    return undefined
  }

  const contentType = response.headers.get('Content-Type') ?? ''

  if (!contentType.includes('application/json')) {
    throw new ApiError('服务器返回了非 JSON 响应', response.status, 'INVALID_CONTENT_TYPE')
  }

  try {
    return (await response.json()) as ApiResponse<T>
  } catch {
    throw new ApiError('服务器返回了无法解析的响应', response.status, 'INVALID_RESPONSE')
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    body,
    query,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    headers: customHeaders,
    signal,
    ...requestInit
  } = options
  const headers = new Headers(customHeaders)
  const { controller, timeoutId } = createAbortController(signal, timeoutMs)

  headers.set('Accept', 'application/json')

  try {
    const response = await fetch(buildUrl(path, query), {
      ...requestInit,
      headers,
      body: normalizeBody(body, headers),
      credentials: requestInit.credentials ?? 'same-origin',
      signal: controller.signal,
    })
    const result = await parseResponse<T>(response)

    if (!result) {
      return undefined as T
    }

    if (!response.ok || !result.success) {
      const failure = result as ApiFailure
      throw new ApiError(
        failure.message || `请求失败：${response.status}`,
        response.status,
        failure.code,
        failure.details,
      )
    }

    return result.data
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('请求超时或已取消', 408, 'REQUEST_ABORTED')
    }

    throw new ApiError(
      error instanceof Error ? error.message : '网络请求失败',
      0,
      'NETWORK_ERROR',
    )
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export const http = {
  get<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return request<T>(path, { ...options, method: 'GET' })
  },
  post<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return request<T>(path, { ...options, method: 'POST', body })
  },
  put<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return request<T>(path, { ...options, method: 'PUT', body })
  },
  patch<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return request<T>(path, { ...options, method: 'PATCH', body })
  },
  delete<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return request<T>(path, { ...options, method: 'DELETE' })
  },
}
