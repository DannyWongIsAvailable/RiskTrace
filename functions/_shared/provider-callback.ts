import { REVIEW_STAGES, type RequestData, type ReviewStage } from './domain'
import { AppError } from './errors'
import { success } from './http'
import { expectObject, expectString, readJsonObject } from './input'
import { processProviderCallback } from './review-service'
import { serializeReviewRun } from './serializers'

export const handleProviderCallback: PagesFunction<Env, string, RequestData> = async ({
  request,
  env,
  data,
}) => {
  // Demo-only callback: intentionally no token/header authentication.
  const body = await readJsonObject(request)
  const reviewRunId = expectString(body.reviewRunId, 'reviewRunId', { min: 1, max: 80 })
  const executeId = parseOptionalString(body.executeId, 'executeId', 120)
  const stage = parseOptionalStage(body.stage)
  const failure = parseFailure(body.failure)
  const materialAnalysis = parseOptionalJsonValue(
    body.materialAnalysis ?? body.material_analysis,
    'materialAnalysis',
  )
  const finalReport = parseOptionalJsonValue(
    body.finalReport ?? body.final_report,
    'finalReport',
  )
  const run = await processProviderCallback(env, {
    reviewRunId,
    executeId,
    stage,
    materialAnalysis,
    finalReport,
    failure,
  })

  return success(serializeReviewRun(run), {
    message: '工作流回调已处理',
    requestId: data.requestId,
  })
}

function parseOptionalJsonValue(value: unknown, fieldName: string): unknown {
  if (typeof value !== 'string') {
    return value
  }

  const normalized = value.trim()
  if (!normalized) {
    return undefined
  }

  try {
    return JSON.parse(normalized) as unknown
  } catch {
    throw new AppError('VALIDATION_FAILED', `${fieldName} 必须是有效 JSON`, 422)
  }
}

function parseOptionalString(
  value: unknown,
  fieldName: string,
  max: number,
): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  return expectString(value, fieldName, { min: 1, max })
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
