import { reportError } from '@/observability'
import type { ApiFailure, ApiResponse } from '@/types/api'

type QueryPrimitive = string | number | boolean | null | undefined
export type QueryValue = QueryPrimitive | readonly QueryPrimitive[]
export type QueryParams = Record<string, QueryValue>

export type ResponseValidator<T> = (data: unknown) => data is T

interface BaseRequestOptions<TBody> extends Omit<RequestInit, 'body'> {
  body?: TBody
  query?: QueryParams
  timeoutMs?: number
}

export interface JsonRequestOptions<TResponse, TBody = unknown>
  extends BaseRequestOptions<TBody> {
  responseType?: 'json'
  validate?: ResponseValidator<TResponse>
}

export interface VoidRequestOptions<TBody = unknown> extends BaseRequestOptions<TBody> {
  responseType: 'void'
}

export type RequestOptions<TResponse = unknown, TBody = unknown> =
  | JsonRequestOptions<TResponse, TBody>
  | VoidRequestOptions<TBody>

const DEFAULT_TIMEOUT_MS = 15_000
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export class ApiError<TDetails = unknown> extends Error {
  readonly status: number
  readonly code: string
  readonly details?: TDetails
  readonly requestId?: string

  constructor(
    message: string,
    status: number,
    code = 'REQUEST_FAILED',
    details?: TDetails,
    requestId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.requestId = requestId
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  if (!isRecord(value)) {
    return false
  }

  if (value.success === true) {
    return hasOwn(value, 'data')
  }

  if (value.success === false) {
    return typeof value.code === 'string' && typeof value.message === 'string'
  }

  return false
}

function buildUrl(path: string, query?: QueryParams): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  const url = new URL(`${API_BASE_URL}${normalizedPath}`, origin)

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

type AbortReason = 'external' | 'timeout'

interface AbortContext {
  controller: AbortController
  getReason: () => AbortReason | undefined
  cleanup: () => void
}

function createAbortContext(
  signal: AbortSignal | null | undefined,
  timeoutMs: number,
): AbortContext {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ApiError('timeoutMs 必须是大于 0 的有限数字', 0, 'INVALID_TIMEOUT')
  }

  const controller = new AbortController()
  let reason: AbortReason | undefined
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined

  const abort = (nextReason: AbortReason) => {
    if (reason !== undefined) {
      return
    }

    reason = nextReason
    controller.abort()
  }

  const handleExternalAbort = () => abort('external')

  if (signal?.aborted) {
    abort('external')
  } else {
    signal?.addEventListener('abort', handleExternalAbort, { once: true })
    timeoutId = globalThis.setTimeout(() => abort('timeout'), timeoutMs)
  }

  return {
    controller,
    getReason: () => reason,
    cleanup: () => {
      if (timeoutId !== undefined) {
        globalThis.clearTimeout(timeoutId)
      }
      signal?.removeEventListener('abort', handleExternalAbort)
    },
  }
}

function isBodyInit(body: unknown): body is BodyInit {
  return (
    typeof body === 'string' ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof ReadableStream
  )
}

function normalizeBody(body: unknown, headers: Headers): BodyInit | undefined {
  if (body === undefined || body === null) {
    return undefined
  }

  if (isBodyInit(body)) {
    return body
  }

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let serializedBody: string | undefined

  try {
    serializedBody = JSON.stringify(body)
  } catch (error) {
    throw new ApiError(
      '请求体无法序列化为 JSON',
      0,
      'INVALID_REQUEST_BODY',
      error instanceof Error ? error.message : error,
    )
  }

  if (serializedBody === undefined) {
    throw new ApiError(
      '请求体无法序列化为 JSON',
      0,
      'INVALID_REQUEST_BODY',
      'JSON.stringify 返回了 undefined',
    )
  }

  return serializedBody
}

function isJsonContentType(contentType: string): boolean {
  const mimeType = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  return mimeType === 'application/json' || mimeType.endsWith('+json')
}

function getRequestId(response: Response, payloadRequestId?: string): string | undefined {
  return payloadRequestId ?? response.headers.get('X-Request-Id') ?? undefined
}

async function parseApiResponse(response: Response): Promise<ApiResponse<unknown>> {
  const contentType = response.headers.get('Content-Type') ?? ''
  const requestId = getRequestId(response)

  if (!isJsonContentType(contentType)) {
    throw new ApiError(
      '服务器返回了非 JSON 响应',
      response.status,
      'INVALID_CONTENT_TYPE',
      undefined,
      requestId,
    )
  }

  const responseText = await response.text()

  if (responseText.trim() === '') {
    throw new ApiError(
      '服务器返回了空响应',
      response.status,
      'EMPTY_RESPONSE',
      undefined,
      requestId,
    )
  }

  let payload: unknown

  try {
    payload = JSON.parse(responseText) as unknown
  } catch {
    throw new ApiError(
      '服务器返回了无法解析的 JSON',
      response.status,
      'INVALID_JSON',
      undefined,
      requestId,
    )
  }

  if (!isApiResponse(payload)) {
    throw new ApiError(
      '服务器响应结构不符合 API 约定',
      response.status,
      'INVALID_RESPONSE',
      undefined,
      requestId,
    )
  }

  return payload
}

function createFailureError(response: Response, failure: ApiFailure): ApiError {
  return new ApiError(
    failure.message || `请求失败：${response.status}`,
    response.status,
    failure.code || 'REQUEST_FAILED',
    failure.details,
    getRequestId(response, failure.meta?.requestId),
  )
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function validateResponseData<T>(
  data: unknown,
  validate: ResponseValidator<T> | undefined,
  response: Response,
): T {
  if (!validate) {
    return data as T
  }

  const requestId = getRequestId(response)

  try {
    if (validate(data)) {
      return data
    }
  } catch (error) {
    throw new ApiError(
      '响应数据校验器执行失败',
      response.status,
      'RESPONSE_VALIDATION_FAILED',
      error instanceof Error ? error.message : error,
      requestId,
    )
  }

  throw new ApiError(
    '服务器返回的数据结构不符合预期',
    response.status,
    'INVALID_RESPONSE_DATA',
    undefined,
    requestId,
  )
}

async function performRequest<TResponse, TBody>(
  path: string,
  body: TBody | undefined,
  query: QueryParams | undefined,
  requestInit: RequestInit,
  headers: Headers,
  responseType: 'json' | 'void',
  validate: ResponseValidator<TResponse> | undefined,
  abortContext: AbortContext,
): Promise<TResponse | void> {
  const response = await fetch(buildUrl(path, query), {
    ...requestInit,
    headers,
    body: normalizeBody(body, headers),
    credentials: requestInit.credentials ?? 'same-origin',
    signal: abortContext.controller.signal,
  })

  if (!response.ok) {
    const result = await parseApiResponse(response)

    if (!result.success) {
      throw createFailureError(response, result)
    }

    throw new ApiError(
      `请求失败：${response.status}`,
      response.status,
      'HTTP_ERROR',
      undefined,
      getRequestId(response),
    )
  }

  if (responseType === 'void') {
    return
  }

  if (response.status === 204) {
    throw new ApiError(
      "接口返回了 204，请将 responseType 设置为 'void'",
      response.status,
      'UNEXPECTED_NO_CONTENT',
      undefined,
      getRequestId(response),
    )
  }

  const result = await parseApiResponse(response)

  if (!result.success) {
    throw createFailureError(response, result)
  }

  return validateResponseData(result.data, validate, response)
}

async function executeRequest<TResponse, TBody>(
  path: string,
  options: RequestOptions<TResponse, TBody>,
): Promise<TResponse | void> {
  const {
    body,
    query,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    headers: customHeaders,
    signal,
    responseType = 'json',
    ...requestInit
  } = options
  const validate = options.responseType === 'void' ? undefined : options.validate
  const headers = new Headers(customHeaders)
  let abortContext: AbortContext | undefined

  headers.set('Accept', 'application/json')

  try {
    abortContext = createAbortContext(signal, timeoutMs)
    return await performRequest(
      path,
      body,
      query,
      requestInit,
      headers,
      responseType,
      validate,
      abortContext,
    )
  } catch (error) {
    let apiError: ApiError

    if (isApiError(error)) {
      apiError = error
    } else if (isAbortError(error)) {
      apiError =
        abortContext?.getReason() === 'timeout'
          ? new ApiError('请求超时', 408, 'REQUEST_TIMEOUT')
          : new ApiError('请求已取消', 0, 'REQUEST_CANCELLED')
    } else {
      apiError = new ApiError(
        error instanceof Error ? error.message : '网络请求失败',
        0,
        'NETWORK_ERROR',
      )
    }

    if (apiError.code !== 'REQUEST_CANCELLED') {
      reportError(apiError, {
        source: 'api',
        severity: apiError.status >= 500 || apiError.status === 0 ? 'error' : 'warning',
        userVisible: false,
        metadata: {
          method: requestInit.method ?? 'GET',
          path,
          status: apiError.status,
          code: apiError.code,
          requestId: apiError.requestId,
        },
      })
    }

    throw apiError
  } finally {
    abortContext?.cleanup()
  }
}

export function request<TBody = unknown>(
  path: string,
  options: VoidRequestOptions<TBody>,
): Promise<void>
export function request<TResponse, TBody = unknown>(
  path: string,
  options?: JsonRequestOptions<TResponse, TBody>,
): Promise<TResponse>
export function request<TResponse, TBody = unknown>(
  path: string,
  options: RequestOptions<TResponse, TBody> = {},
): Promise<TResponse | void> {
  return executeRequest(path, options)
}

type JsonMethodOptions<TResponse> = Omit<
  JsonRequestOptions<TResponse, never>,
  'method' | 'body'
>
type VoidMethodOptions = Omit<VoidRequestOptions<never>, 'method' | 'body'>
type MethodOptions<TResponse> = JsonMethodOptions<TResponse> | VoidMethodOptions

function get(path: string, options: VoidMethodOptions): Promise<void>
function get<TResponse>(path: string, options?: JsonMethodOptions<TResponse>): Promise<TResponse>
function get<TResponse>(
  path: string,
  options: MethodOptions<TResponse> = {},
): Promise<TResponse | void> {
  return executeRequest(path, { ...options, method: 'GET' })
}

function post<TBody = unknown>(
  path: string,
  body: TBody | undefined,
  options: VoidMethodOptions,
): Promise<void>
function post<TResponse, TBody = unknown>(
  path: string,
  body?: TBody,
  options?: JsonMethodOptions<TResponse>,
): Promise<TResponse>
function post<TResponse, TBody = unknown>(
  path: string,
  body?: TBody,
  options: MethodOptions<TResponse> = {},
): Promise<TResponse | void> {
  return executeRequest(path, { ...options, method: 'POST', body })
}

function put<TBody = unknown>(
  path: string,
  body: TBody | undefined,
  options: VoidMethodOptions,
): Promise<void>
function put<TResponse, TBody = unknown>(
  path: string,
  body?: TBody,
  options?: JsonMethodOptions<TResponse>,
): Promise<TResponse>
function put<TResponse, TBody = unknown>(
  path: string,
  body?: TBody,
  options: MethodOptions<TResponse> = {},
): Promise<TResponse | void> {
  return executeRequest(path, { ...options, method: 'PUT', body })
}

function patch<TBody = unknown>(
  path: string,
  body: TBody | undefined,
  options: VoidMethodOptions,
): Promise<void>
function patch<TResponse, TBody = unknown>(
  path: string,
  body?: TBody,
  options?: JsonMethodOptions<TResponse>,
): Promise<TResponse>
function patch<TResponse, TBody = unknown>(
  path: string,
  body?: TBody,
  options: MethodOptions<TResponse> = {},
): Promise<TResponse | void> {
  return executeRequest(path, { ...options, method: 'PATCH', body })
}

function remove(path: string, options: VoidMethodOptions): Promise<void>
function remove<TResponse>(
  path: string,
  options?: JsonMethodOptions<TResponse>,
): Promise<TResponse>
function remove<TResponse>(
  path: string,
  options: MethodOptions<TResponse> = {},
): Promise<TResponse | void> {
  return executeRequest(path, { ...options, method: 'DELETE' })
}

export const http = {
  get,
  post,
  put,
  patch,
  delete: remove,
}
