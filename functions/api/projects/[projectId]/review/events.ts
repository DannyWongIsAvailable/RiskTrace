import type { RequestData } from '../../../../_shared/domain'
import { AppError } from '../../../../_shared/errors'
import { success } from '../../../../_shared/http'
import { getReviewEvents } from '../../../../_shared/review-service'
import { getPathParam } from '../../../../_shared/route'

function parseIntegerQuery(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
  name: string,
): number {
  if (raw === null || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new AppError('VALIDATION_FAILED', `${name} 参数无效`, 400)
  }
  return value
}

export const onRequestGet: PagesFunction<Env, 'projectId', RequestData> = async ({
  request,
  params,
  env,
  data,
}) => {
  const projectId = getPathParam(params, 'projectId')
  const url = new URL(request.url)
  const after = parseIntegerQuery(url.searchParams.get('after'), -1, -1, Number.MAX_SAFE_INTEGER, 'after')
  const limit = parseIntegerQuery(url.searchParams.get('limit'), 100, 1, 5000, 'limit')
  const page = await getReviewEvents(env, projectId, after, limit)

  return success(
    {
      reviewRunId: page.reviewRunId,
      runId: page.executeId || null,
      sessionId: page.sessionId ?? null,
      events: page.events,
      nextSeq: page.nextSeq,
      hasMore: page.hasMore,
    },
    { requestId: data.requestId },
  )
}
