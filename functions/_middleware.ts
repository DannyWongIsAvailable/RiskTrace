import { failure } from './_shared/http'

type RequestData = {
  requestId?: string
}

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

export const onRequest: PagesFunction<Env, string, RequestData> = async (context) => {
  const startedAt = Date.now()
  const requestId = resolveRequestId(context.request)
  const url = new URL(context.request.url)
  context.data.requestId = requestId

  try {
    const response = await context.next()
    const durationMs = Date.now() - startedAt
    const headers = new Headers(response.headers)
    headers.set('X-Request-Id', requestId)
    headers.set('Server-Timing', `app;dur=${durationMs}`)

    writeLog('info', {
      type: 'http_request',
      requestId,
      method: context.request.method,
      path: url.pathname,
      status: response.status,
      durationMs,
      timestamp: new Date().toISOString(),
    })

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  } catch (error) {
    const durationMs = Date.now() - startedAt

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

    return failure('INTERNAL_ERROR', '服务器内部错误', {
      status: 500,
      requestId,
    })
  }
}
