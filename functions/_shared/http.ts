interface ApiMeta {
  requestId?: string
  timestamp: string
}

interface ResponseOptions {
  status?: number
  message?: string
  requestId?: string
  headers?: HeadersInit
}

function createHeaders(headers?: HeadersInit): Headers {
  const result = new Headers(headers)
  result.set('Cache-Control', 'no-store')
  result.set('Content-Type', 'application/json; charset=utf-8')
  result.set('X-Content-Type-Options', 'nosniff')
  return result
}

function createMeta(requestId?: string): ApiMeta {
  return {
    requestId,
    timestamp: new Date().toISOString(),
  }
}

export function success<T>(data: T, options: ResponseOptions = {}): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data,
      message: options.message,
      meta: createMeta(options.requestId),
    }),
    {
      status: options.status ?? 200,
      headers: createHeaders(options.headers),
    },
  )
}

export function failure(
  code: string,
  message: string,
  options: ResponseOptions & { details?: unknown } = {},
): Response {
  return new Response(
    JSON.stringify({
      success: false,
      code,
      message,
      details: options.details,
      meta: createMeta(options.requestId),
    }),
    {
      status: options.status ?? 400,
      headers: createHeaders(options.headers),
    },
  )
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '服务器内部错误'
}
