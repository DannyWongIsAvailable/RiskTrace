import { REVIEW_STAGES, type RequestData, type ReviewStage } from '../../_shared/domain'
import { AppError } from '../../_shared/errors'
import { success } from '../../_shared/http'
import { expectObject, expectString, readJsonObject } from '../../_shared/input'
import { processProviderCallback } from '../../_shared/review-service'
import { secureTokenEquals } from '../../_shared/security'
import { serializeReviewRun } from '../../_shared/serializers'

export const onRequestPost: PagesFunction<Env, string, RequestData> = async ({
  request,
  env,
  data,
}) => {
  const expectedToken = env.RISKTRACE_CALLBACK_TOKEN?.trim()
  const providedToken = request.headers.get('X-RiskTrace-Callback-Token')?.trim()
  if (!expectedToken || !providedToken || !(await secureTokenEquals(expectedToken, providedToken))) {
    throw new AppError('UNAUTHORIZED', '工作流回调鉴权失败', 401)
  }

  const body = await readJsonObject(request)
  const reviewRunId = expectString(body.reviewRunId, 'reviewRunId', { min: 1, max: 80 })
  const executeId = expectString(body.executeId, 'executeId', { min: 1, max: 120 })
  const stage = parseOptionalStage(body.stage)
  const failure = parseFailure(body.failure)
  const run = await processProviderCallback(env, {
    reviewRunId,
    executeId,
    stage,
    materialAnalysis: body.materialAnalysis ?? body.material_analysis,
    finalReport: body.finalReport ?? body.final_report,
    failure,
  })

  return success(serializeReviewRun(run), {
    message: '工作流回调已处理',
    requestId: data.requestId,
  })
}

function parseOptionalStage(value: unknown): ReviewStage | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  const stage = expectString(value, 'stage', { min: 1, max: 60 })
  if (!REVIEW_STAGES.includes(stage as ReviewStage)) {
    throw new AppError('VALIDATION_FAILED', 'stage 枚举值无效', 422)
  }

  return stage as ReviewStage
}

function parseFailure(value: unknown): { code: string; message: string } | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  const record = expectObject(value, 'failure')
  return {
    code: expectString(record.code, 'failure.code', { min: 1, max: 80 }),
    message: expectString(record.message, 'failure.message', { min: 1, max: 300 }),
  }
}
