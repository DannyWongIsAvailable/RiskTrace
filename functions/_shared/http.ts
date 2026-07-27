export function success<T>(
  data: T,
  status = 200,
): Response {
  return Response.json(
    {
      success: true,
      data,
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}

export function failure(
  code: string,
  message: string,
  status = 400,
): Response {
  return Response.json(
    {
      success: false,
      code,
      message,
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : '服务器内部错误'
}