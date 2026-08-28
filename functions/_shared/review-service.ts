import { applyMaterialAnalysisToDocuments, listDocuments } from './document-repository'
import type {
  MaterialAnalysis,
  ProjectRow,
  ReviewReport,
  ReviewRunRow,
  ReviewStage,
  ReviewStatusResponse,
} from './domain'
import { AppError } from './errors'
import { createReviewProviderFileList } from './file-service'
import { createId } from './ids'
import { requireProject } from './project-repository'
import {
  attachProviderExecuteId,
  createOrGetReviewRun,
  markMaterialAnalysisSaved,
  prepareReviewRetry,
  requireReviewRunById,
  requireReviewRunByProject,
  updateProviderStatus,
  updateReviewState,
} from './review-repository'
import { DeepSeekHarnessReviewProvider } from './deepseek-harness-provider'
import type { ProviderEventView, ProviderRunEventPage, ProviderRunSnapshot } from './review-provider'
import {
  normalizeMaterialAnalysis,
  normalizeReviewReport,
  parseProviderOutput,
} from './review-result-validation'
import { findReviewResult, reviewResultExists, upsertReviewResult } from './result-repository'

const RESULT_SCHEMA_VERSION = '1.0'
const LIVE_EVENT_PAGE_LIMIT = 200
const COMPLETED_EVENT_PAGE_LIMIT = 5000

export async function startProjectReview(
  env: Env,
  input: { projectId: string },
): Promise<ReviewRunRow> {
  const project = await requireProject(env.risktrace_db, input.projectId)
  const documents = await requireUploadedDocuments(env, input.projectId)
  const now = new Date().toISOString()
  const run = await createOrGetReviewRun(env.risktrace_db, {
    id: createId('review'),
    projectId: input.projectId,
    now,
  })

  if (run.status === 'completed') {
    return run
  }
  if (run.status === 'failed') {
    throw new AppError('REVIEW_RETRY_REQUIRED', '合规审查已失败，请使用重试接口', 409)
  }
  if (run.provider_execute_id) {
    return run
  }

  const harness = new DeepSeekHarnessReviewProvider(env)
  try {
    return await createHarnessRun(env, harness, project, run, documents)
  } catch (error) {
    await markReviewFailed(env, {
      reviewRunId: run.id,
      projectId: input.projectId,
      code: error instanceof AppError ? error.code : 'WORKFLOW_START_FAILED',
      message: error instanceof AppError ? error.message : '合规审查启动失败',
    })
    throw error
  }
}

export async function retryProjectReview(
  env: Env,
  input: { projectId: string },
): Promise<ReviewRunRow> {
  const project = await requireProject(env.risktrace_db, input.projectId)
  const documents = await requireUploadedDocuments(env, input.projectId)
  const run = await requireReviewRunByProject(env.risktrace_db, input.projectId)

  if (run.status !== 'failed') {
    throw new AppError('CONFLICTING_STATE', '只有失败的合规审查可以重试', 409)
  }
  if (run.attempt_count >= 3) {
    throw new AppError('RETRY_LIMIT_EXCEEDED', '合规审查已达到最大重试次数', 409)
  }

  const harness = new DeepSeekHarnessReviewProvider(env)
  const now = new Date().toISOString()
  await prepareReviewRetry(env.risktrace_db, {
    reviewRunId: run.id,
    projectId: input.projectId,
    now,
  })
  const retryRun = await requireReviewRunById(env.risktrace_db, run.id)
  try {
    return await createHarnessRun(env, harness, project, retryRun, documents)
  } catch (error) {
    await markReviewFailed(env, {
      reviewRunId: run.id,
      projectId: input.projectId,
      code: error instanceof AppError ? error.code : 'WORKFLOW_START_FAILED',
      message: error instanceof AppError ? error.message : '合规审查重试启动失败',
    })
    throw error
  }
}

export async function getReviewStatus(
  env: Env,
  projectId: string,
): Promise<ReviewStatusResponse> {
  let run = await requireReviewRunByProject(env.risktrace_db, projectId)

  if (run.status === 'reviewing' && run.provider_execute_id) {
    try {
      run = await refreshHarnessRun(env, run)
    } catch (error) {
      if (!isTransientProviderRefreshError(error)) {
        throw error
      }
      // A temporary GET /runs failure must not turn a healthy background execution into a
      // business-level failure. The next browser poll will reconcile the same executeId again.
      console.warn('Provider 状态暂时无法刷新，保留 reviewing 状态', {
        projectId,
        reviewRunId: run.id,
        code: error.code,
      })
    }
  }

  const [materialAnalysisAvailable, reportAvailable] = await Promise.all([
    reviewResultExists(env.risktrace_db, run.id, 'material_analysis'),
    reviewResultExists(env.risktrace_db, run.id, 'final_report'),
  ])

  return toReviewStatusResponse(run, materialAnalysisAvailable, reportAvailable)
}

export async function getReviewEvents(
  env: Env,
  projectId: string,
  afterSeq: number,
  limit = 100,
  view: ProviderEventView = 'raw',
): Promise<ProviderRunEventPage & { reviewRunId: string }> {
  const run = await requireReviewRunByProject(env.risktrace_db, projectId)
  if (!run.provider_execute_id) {
    return {
      reviewRunId: run.id,
      executeId: '',
      events: [],
      nextSeq: afterSeq,
      hasMore: false,
    }
  }
  if (run.provider_name && run.provider_name !== 'deepseek-harness') {
    throw new AppError(
      'WORKFLOW_PROVIDER_INVALID_CONFIG',
      '当前审查运行不是 DeepSeek Harness 执行，无法读取 Session Event',
      500,
    )
  }

  const maxEventPageLimit =
    run.status === 'reviewing' ? LIVE_EVENT_PAGE_LIMIT : COMPLETED_EVENT_PAGE_LIMIT
  const effectiveLimit = Math.max(1, Math.min(maxEventPageLimit, Math.trunc(limit)))

  const harness = new DeepSeekHarnessReviewProvider(env)
  const page = await harness.getEvents(run.provider_execute_id, afterSeq, effectiveLimit, view)
  if (page.executeId !== run.provider_execute_id) {
    throw new AppError('WORKFLOW_PROVIDER_INVALID_RESPONSE', 'DeepSeek Harness 返回了错误的 runId', 502)
  }

  return {
    reviewRunId: run.id,
    ...page,
  }
}

export async function getMaterialAnalysis(
  env: Env,
  projectId: string,
): Promise<MaterialAnalysis> {
  const run = await requireReviewRunByProject(env.risktrace_db, projectId)
  const result = await findReviewResult(env.risktrace_db, run.id, 'material_analysis')
  if (!result) {
    throw new AppError('MATERIAL_ANALYSIS_NOT_READY', '材料理解结果尚未生成', 404)
  }

  return parseStoredResult<MaterialAnalysis>(result.result_json)
}

export async function getFinalReport(env: Env, projectId: string): Promise<ReviewReport> {
  const run = await requireReviewRunByProject(env.risktrace_db, projectId)
  const result = await findReviewResult(env.risktrace_db, run.id, 'final_report')
  if (!result) {
    throw new AppError('REPORT_NOT_READY', '合规审查报告尚未生成', 404)
  }

  return parseStoredResult<ReviewReport>(result.result_json)
}

async function createHarnessRun(
  env: Env,
  harness: DeepSeekHarnessReviewProvider,
  project: ProjectRow,
  run: ReviewRunRow,
  documents: Awaited<ReturnType<typeof listDocuments>>,
): Promise<ReviewRunRow> {
  const files = await createReviewProviderFileList(env, documents)
  const snapshot = await harness.createRun({
    projectId: project.id,
    reviewRunId: run.id,
    projectTitle: project.title,
    attemptNo: run.attempt_count,
    files,
  })

  await attachProviderExecuteId(env.risktrace_db, {
    reviewRunId: run.id,
    providerName: 'deepseek-harness',
    executeId: snapshot.executeId,
    providerStatus: providerStatusForSnapshot(snapshot),
    progress: progressForSnapshot(snapshot),
    now: new Date().toISOString(),
  })

  const attachedRun = await requireReviewRunById(env.risktrace_db, run.id)
  if (snapshot.state === 'queued' || snapshot.state === 'running') {
    return attachedRun
  }

  await applyProviderRunResult(env, attachedRun, snapshot)
  return requireReviewRunById(env.risktrace_db, run.id)
}

async function refreshHarnessRun(env: Env, run: ReviewRunRow): Promise<ReviewRunRow> {
  if (!run.provider_execute_id || run.status !== 'reviewing') {
    return run
  }

  if (run.provider_name && run.provider_name !== 'deepseek-harness') {
    throw new AppError(
      'WORKFLOW_PROVIDER_INVALID_CONFIG',
      '当前审查运行不是 DeepSeek Harness 执行，无法继续读取',
      500,
    )
  }

  const harness = new DeepSeekHarnessReviewProvider(env)
  const snapshot = await harness.getRun(run.provider_execute_id)
  if (snapshot.executeId !== run.provider_execute_id) {
    throw new AppError('WORKFLOW_PROVIDER_INVALID_RESPONSE', 'Provider 返回了错误的运行编号', 502)
  }

  if (snapshot.state === 'queued' || snapshot.state === 'running') {
    await updateProviderStatus(env.risktrace_db, {
      reviewRunId: run.id,
      projectId: run.project_id,
      providerStatus: snapshot.state === 'queued' ? 'starting' : 'running',
      progress: 0,
      now: new Date().toISOString(),
    })
    return requireReviewRunById(env.risktrace_db, run.id)
  }

  await applyProviderRunResult(env, run, snapshot)
  return requireReviewRunById(env.risktrace_db, run.id)
}

async function applyProviderRunResult(
  env: Env,
  run: ReviewRunRow,
  providerResult: ProviderRunSnapshot,
): Promise<void> {
  if (providerResult.state === 'queued' || providerResult.state === 'running') {
    return
  }

  if (providerResult.state === 'interrupted') {
    await markReviewFailed(env, {
      reviewRunId: run.id,
      projectId: run.project_id,
      code: 'WORKFLOW_INTERRUPTED',
      message: '审查执行进入了当前流程不支持的人工交互节点',
      providerStatus: 'interrupt',
    })
    return
  }

  if (providerResult.state === 'failed') {
    await markReviewFailed(env, {
      reviewRunId: run.id,
      projectId: run.project_id,
      code: 'WORKFLOW_EXECUTION_FAILED',
      message: providerResult.providerMessage
        ? `合规审查执行失败：${providerResult.providerMessage}`
        : '合规审查执行失败',
    })
    return
  }

  try {
    await persistCompletedProviderOutput(env, run, providerResult.content ?? '')
  } catch (error) {
    await markReviewFailed(env, {
      reviewRunId: run.id,
      projectId: run.project_id,
      code: error instanceof AppError ? error.code : 'WORKFLOW_OUTPUT_INVALID',
      message: error instanceof AppError ? error.message : '审查结果校验失败',
    })
  }
}

function providerStatusForSnapshot(snapshot: ProviderRunSnapshot) {
  switch (snapshot.state) {
    case 'queued':
      return 'starting' as const
    case 'running':
      return 'running' as const
    case 'succeeded':
      return 'success' as const
    case 'interrupted':
      return 'interrupt' as const
    case 'failed':
      return 'failed' as const
  }
}

function progressForSnapshot(snapshot: ProviderRunSnapshot): number {
  return snapshot.state === 'succeeded' ? 100 : 0
}

function isTransientProviderRefreshError(error: unknown): error is AppError {
  return (
    error instanceof AppError &&
    ['WORKFLOW_PROVIDER_UNAVAILABLE', 'WORKFLOW_PROVIDER_TIMEOUT'].includes(error.code)
  )
}

async function persistCompletedProviderOutput(
  env: Env,
  run: ReviewRunRow,
  content: string,
): Promise<void> {
  const project = await requireProject(env.risktrace_db, run.project_id)
  const documents = await listDocuments(env.risktrace_db, run.project_id)
  const output = parseProviderOutput(content)
  const rawOutputObjectKey = await storeRawProviderOutput(env, run, content)

  if (output.materialAnalysis === undefined) {
    throw new AppError('WORKFLOW_OUTPUT_INVALID', '审查执行完成但未返回材料理解结果', 502)
  }
  if (output.finalReport === undefined) {
    throw new AppError('WORKFLOW_OUTPUT_INVALID', '审查执行完成但未返回最终报告', 502)
  }

  // 先完整校验两个结果，再写入任何正式结果，避免最终报告校验失败时留下半成品。
  const analysis = normalizeMaterialAnalysis(output.materialAnalysis, project, documents)
  const report = normalizeReviewReport(output.finalReport, project, documents)

  await persistMaterialAnalysis(env, run, analysis, rawOutputObjectKey)
  await persistFinalReport(env, run, report, rawOutputObjectKey)
}

async function persistMaterialAnalysis(
  env: Env,
  run: ReviewRunRow,
  analysis: MaterialAnalysis,
  rawOutputObjectKey?: string,
): Promise<void> {
  const now = new Date().toISOString()
  await upsertReviewResult(env.risktrace_db, {
    reviewRunId: run.id,
    resultType: 'material_analysis',
    schemaVersion: RESULT_SCHEMA_VERSION,
    result: analysis,
    rawOutputObjectKey,
    now,
  })
  await applyMaterialAnalysisToDocuments(env.risktrace_db, run.project_id, analysis, now)
  await markMaterialAnalysisSaved(env.risktrace_db, {
    reviewRunId: run.id,
    projectId: run.project_id,
    now,
  })
}

async function persistFinalReport(
  env: Env,
  run: ReviewRunRow,
  report: ReviewReport,
  rawOutputObjectKey?: string,
): Promise<void> {
  const now = new Date().toISOString()
  await upsertReviewResult(env.risktrace_db, {
    reviewRunId: run.id,
    resultType: 'final_report',
    schemaVersion: RESULT_SCHEMA_VERSION,
    result: report,
    rawOutputObjectKey,
    now,
  })
  await updateReviewState(env.risktrace_db, {
    reviewRunId: run.id,
    projectId: run.project_id,
    status: 'completed',
    stage: 'report_completed',
    providerStatus: 'success',
    progress: 100,
    now,
    finishedAt: now,
  })
}

async function markReviewFailed(
  env: Env,
  input: {
    reviewRunId: string
    projectId: string
    code: string
    message: string
    providerStatus?: 'failed' | 'interrupt'
  },
): Promise<void> {
  const now = new Date().toISOString()
  await updateReviewState(env.risktrace_db, {
    reviewRunId: input.reviewRunId,
    projectId: input.projectId,
    status: 'failed',
    stage: 'failed',
    providerStatus: input.providerStatus ?? 'failed',
    progress: 0,
    errorCode: input.code,
    errorMessage: input.message,
    now,
    finishedAt: now,
  })
}

async function requireUploadedDocuments(env: Env, projectId: string) {
  const documents = await listDocuments(env.risktrace_db, projectId)
  if (documents.length === 0) {
    throw new AppError('NO_DOCUMENTS', '请至少上传一份材料后再开始审查', 422)
  }

  const incomplete = documents.filter((document) => document.upload_status !== 'uploaded')
  if (incomplete.length > 0) {
    throw new AppError('DOCUMENT_UPLOAD_INCOMPLETE', '仍有材料尚未完成上传确认', 409, {
      documentIds: incomplete.map((document) => document.id),
    })
  }

  return documents
}

async function storeRawProviderOutput(
  env: Env,
  run: ReviewRunRow,
  content: string,
): Promise<string | undefined> {
  if (!content) {
    return undefined
  }

  const objectKey = `projects/${run.project_id}/outputs/${run.id}/provider-output-attempt-${run.attempt_count}.json`
  try {
    await env.risktrace_files.put(objectKey, content, {
      httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    })
    return objectKey
  } catch {
    return undefined
  }
}

function toReviewStatusResponse(
  run: ReviewRunRow,
  materialAnalysisAvailable: boolean,
  reportAvailable: boolean,
): ReviewStatusResponse {
  const response: ReviewStatusResponse = {
    projectId: run.project_id,
    reviewRunId: run.id,
    status: run.status,
    stage: run.stage,
    progress: run.progress,
    message: stageMessage(run.stage),
    materialAnalysisAvailable,
    reportAvailable,
  }

  if (run.status === 'failed' && run.error_code && run.error_message) {
    response.error = {
      code: run.error_code,
      message: run.error_message,
      retryable: run.attempt_count < 3,
    }
  }

  return response
}

function stageMessage(stage: ReviewStage): string {
  switch (stage) {
    case 'material_analysis_running':
      return '正在理解项目材料'
    case 'material_analysis_completed':
      return '材料理解已完成，准备开始自动合规审查'
    case 'domain_review_running':
      return '材料理解已完成，正在执行自动合规审查'
    case 'report_aggregating':
      return '自动合规审查已完成，正在生成结果'
    case 'report_completed':
      return '合规审查已完成'
    case 'failed':
      return '合规审查失败'
  }
}

function parseStoredResult<T>(value: string): T {
  try {
    return JSON.parse(value) as T
  } catch {
    throw new AppError('STORED_RESULT_INVALID', '已保存结果无法读取', 500)
  }
}
