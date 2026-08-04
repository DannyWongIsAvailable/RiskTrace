import { isAppError } from './_shared/errors'
import { failure } from './_shared/http'
import type { RequestData } from './_shared/domain'

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/

function resolveRequestId(request: Request): string {
  const incomingRequestId = request.headers.get('X-Request-Id')?.trim()

  return incomingRequestId && REQUEST_ID_PATTERN.test(incomingRequestId)
    ? incomingRequestId
    : crypto.randomUUID()
}

function writeLog(level: 'info' | 'error', payload: Record<string, unknown>): void {
  const serialized = JSON.stringify(payload)

  if (level === 'error') {
    console.error(serialized)
    return
  }

  console.log(serialized)
}

function withRequestHeaders(response: Response, requestId: string, durationMs: number): Response {
  const headers = new Headers(response.headers)
  headers.set('X-Request-Id', requestId)
  headers.set('Server-Timing', `app;dur=${durationMs}`)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export const onRequest: PagesFunction<Env, string, RequestData> = async (context) => {
  const startedAt = Date.now()
  const requestId = resolveRequestId(context.request)
  const url = new URL(context.request.url)
  context.data.requestId = requestId

  try {
    const response = await context.next()
    const durationMs = Date.now() - startedAt

    writeLog('info', {
      type: 'http_request',
      requestId,
      method: context.request.method,
      path: url.pathname,
      status: response.status,
      durationMs,
      timestamp: new Date().toISOString(),
    })

    return withRequestHeaders(response, requestId, durationMs)
  } catch (error) {
    const durationMs = Date.now() - startedAt

    if (isAppError(error)) {
      writeLog(error.status >= 500 ? 'error' : 'info', {
        type: 'business_error',
        requestId,
        method: context.request.method,
        path: url.pathname,
        status: error.status,
        code: error.code,
        durationMs,
        timestamp: new Date().toISOString(),
      })

      return withRequestHeaders(
        failure(error.code, error.message, {
          status: error.status,
          details: error.details,
          requestId,
        }),
        requestId,
        durationMs,
      )
    }

    writeLog('error', {
      type: 'http_error',
      requestId,
      method: context.request.method,
      path: url.pathname,
      durationMs,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : '服务器内部错误',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    })

    return withRequestHeaders(
      failure('INTERNAL_ERROR', '服务器内部错误', {
        status: 500,
        requestId,
      }),
      requestId,
      durationMs,
    )
  }
}
