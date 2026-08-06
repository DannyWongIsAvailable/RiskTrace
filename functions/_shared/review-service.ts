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
import { createWorkflowFileList } from './file-service'
import { createId } from './ids'
import { isMockReviewRun, synchronizeProjectReviewWithMock } from './mock-review-service'
import { requireProject } from './project-repository'
import {
  attachProviderExecuteId,
  claimReviewRunStart,
  createOrGetReviewRun,
  markMaterialAnalysisSaved,
  prepareReviewRetry,
  requireReviewRunById,
  requireReviewRunByProject,
  updateReviewState,
} from './review-repository'
import { createReviewProvider } from './xingchen-provider'
import {
  normalizeMaterialAnalysis,
  normalizeReviewReport,
  parseProviderOutput,
} from './review-result-validation'
import { findReviewResult, reviewResultExists, upsertReviewResult } from './result-repository'

const RESULT_SCHEMA_VERSION = '1.0'

export async function startProjectReview(
  env: Env,
  input: { projectId: string; requestOrigin: string },
): Promise<ReviewRunRow> {
  const project = await requireProject(env.risktrace_db, input.projectId)
  const documents = await requireUploadedDocuments(env, input.projectId)
  const now = new Date().toISOString()
  const run = await createOrGetReviewRun(env.risktrace_db, {
    id: createId('review'),
    projectId: input.projectId,
    now,
  })

  if (run.status === 'completed' || run.provider_execute_id || run.provider_status === 'starting') {
    return run
  }
  if (run.status === 'failed') {
    throw new AppError('REVIEW_RETRY_REQUIRED', '合规审查已失败，请使用重试接口', 409)
  }

  const claimed = await claimReviewRunStart(env.risktrace_db, run.id, now)
  if (!claimed) {
    return requireReviewRunByProject(env.risktrace_db, input.projectId)
  }

  try {
    return await createProviderRun(env, project, run.id, documents, input.requestOrigin)
  } catch (error) {
    await markReviewFailed(env, {
      reviewRunId: run.id,
      projectId: input.projectId,
      code: error instanceof AppError ? error.code : 'WORKFLOW_START_FAILED',
      message: '合规审查工作流启动失败',
    })
    throw error
  }
}

export async function retryProjectReview(
  env: Env,
  input: { projectId: string; requestOrigin: string },
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

  const now = new Date().toISOString()
  await prepareReviewRetry(env.risktrace_db, {
    reviewRunId: run.id,
    projectId: input.projectId,
    now,
  })
  const claimed = await claimReviewRunStart(env.risktrace_db, run.id, now)
  if (!claimed) {
    throw new AppError('REVIEW_ALREADY_RUNNING', '合规审查正在运行', 409)
  }

  try {
    return await createProviderRun(env, project, run.id, documents, input.requestOrigin)
  } catch (error) {
    await markReviewFailed(env, {
      reviewRunId: run.id,
      projectId: input.projectId,
      code: error instanceof AppError ? error.code : 'WORKFLOW_START_FAILED',
      message: '合规审查工作流重试启动失败',
    })
    throw error
  }
}

export async function synchronizeProjectReview(env: Env, projectId: string): Promise<ReviewRunRow> {
  const run = await requireReviewRunByProject(env.risktrace_db, projectId)
  if (run.status !== 'reviewing' || !run.provider_execute_id) {
    return run
  }

  const provider = createReviewProvider(env)
  const providerResult = await provider.getRun(run.provider_execute_id)

  if (providerResult.state === 'running') {
    if (run.provider_status !== 'running') {
      await updateReviewState(env.risktrace_db, {
        reviewRunId: run.id,
        projectId,
        status: 'reviewing',
        stage: run.stage,
        providerStatus: 'running',
        progress: run.progress,
        now: new Date().toISOString(),
      })
    }
    return requireReviewRunByProject(env.risktrace_db, projectId)
  }

  if (providerResult.state === 'interrupted') {
    await markReviewFailed(env, {
      reviewRunId: run.id,
      projectId,
      code: 'WORKFLOW_INTERRUPTED',
      message: '工作流进入了当前 Demo 不支持的人工问答节点',
      providerStatus: 'interrupt',
    })
    return requireReviewRunByProject(env.risktrace_db, projectId)
  }

  if (providerResult.state === 'failed') {
    await markReviewFailed(env, {
      reviewRunId: run.id,
      projectId,
      code: 'WORKFLOW_EXECUTION_FAILED',
      message: '合规审查工作流执行失败',
    })
    return requireReviewRunByProject(env.risktrace_db, projectId)
  }

  try {
    await persistProviderSuccess(env, run, providerResult.content ?? '')
  } catch (error) {
    await markReviewFailed(env, {
      reviewRunId: run.id,
      projectId,
      code: error instanceof AppError ? error.code : 'WORKFLOW_OUTPUT_INVALID',
      message: '工作流结果校验失败',
    })
  }

  return requireReviewRunByProject(env.risktrace_db, projectId)
}

export async function getReviewStatus(
  env: Env,
  projectId: string,
  synchronize = true,
): Promise<ReviewStatusResponse> {
  let run = await requireReviewRunByProject(env.risktrace_db, projectId)

  if (synchronize) {
    run = isMockReviewRun(run)
      ? await synchronizeProjectReviewWithMock(env, run)
      : await synchronizeProjectReview(env, projectId)
  }

  const [materialAnalysisAvailable, reportAvailable] = await Promise.all([
    reviewResultExists(env.risktrace_db, run.id, 'material_analysis'),
    reviewResultExists(env.risktrace_db, run.id, 'final_report'),
  ])

  return toReviewStatusResponse(run, materialAnalysisAvailable, reportAvailable)
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

export async function processProviderCallback(
  env: Env,
  input: {
    reviewRunId: string
    executeId: string
    stage?: ReviewStage
    materialAnalysis?: unknown
    finalReport?: unknown
    failure?: { code: string; message: string }
  },
): Promise<ReviewRunRow> {
  const run = await requireReviewRunById(env.risktrace_db, input.reviewRunId)
  if (!run.provider_execute_id || run.provider_execute_id !== input.executeId) {
    throw new AppError('STALE_PROVIDER_CALLBACK', '工作流回调不属于当前有效执行', 409)
  }
  if (run.status !== 'reviewing') {
    return run
  }

  const project = await requireProject(env.risktrace_db, run.project_id)
  const documents = await listDocuments(env.risktrace_db, run.project_id)

  if (input.failure || input.stage === 'failed') {
    await markReviewFailed(env, {
      reviewRunId: run.id,
      projectId: run.project_id,
      code: input.failure?.code ?? 'WORKFLOW_EXECUTION_FAILED',
      message: input.failure?.message ?? '合规审查工作流执行失败',
    })
    return requireReviewRunById(env.risktrace_db, run.id)
  }

  if (input.materialAnalysis !== undefined) {
    const analysis = normalizeMaterialAnalysis(input.materialAnalysis, project, documents)
    await persistMaterialAnalysis(env, run, analysis, input.stage)
  } else if (input.stage && input.stage !== 'report_completed') {
    await updateRunningStage(env, run, input.stage)
  }

  if (input.finalReport !== undefined) {
    const materialAnalysisAvailable = await reviewResultExists(
      env.risktrace_db,
      run.id,
      'material_analysis',
    )
    if (!materialAnalysisAvailable) {
      throw new AppError('WORKFLOW_OUTPUT_INVALID', '最终报告回调缺少已保存的材料理解结果', 422)
    }
    const report = normalizeReviewReport(input.finalReport, project, documents)
    await persistFinalReport(env, run, report)
  }

  return requireReviewRunById(env.risktrace_db, run.id)
}

async function createProviderRun(
  env: Env,
  project: ProjectRow,
  reviewRunId: string,
  documents: Awaited<ReturnType<typeof listDocuments>>,
  requestOrigin: string,
): Promise<ReviewRunRow> {
  const callbackToken = env.RISKTRACE_CALLBACK_TOKEN?.trim()
  if (!callbackToken) {
    throw new AppError('CALLBACK_NOT_CONFIGURED', '工作流回调鉴权尚未完成配置', 500)
  }

  const files = await createWorkflowFileList(env, documents)
  const callbackUrl = `${requestOrigin.replace(/\/$/, '')}/internal/provider/xingchen-callback`
  const workflowInput = {
    projectId: project.id,
    reviewRunId,
    projectTitle: project.title,
    files,
    callbackUrl,
  }
  const provider = createReviewProvider(env)
  const providerRun = await provider.createRun({
    projectId: project.id,
    reviewRunId,
    parameters: {
      PROJECT_ID: project.id,
      REVIEW_RUN_ID: reviewRunId,
      PROJECT_TITLE: project.title,
      FILES_JSON: JSON.stringify(files),
      CALLBACK_URL: callbackUrl,
      CALLBACK_TOKEN: callbackToken,
      AGENT_USER_INPUT: JSON.stringify(workflowInput),
    },
  })
  const now = new Date().toISOString()
  try {
    await attachProviderExecuteId(env.risktrace_db, {
      reviewRunId,
      executeId: providerRun.executeId,
      now,
    })
  } catch (error) {
    try {
      await provider.cancelRun(providerRun.executeId)
    } catch {
      // The current run is already being failed by the caller; cancellation is best effort.
    }
    throw error
  }

  return requireReviewRunById(env.risktrace_db, reviewRunId)
}

async function persistProviderSuccess(env: Env, run: ReviewRunRow, content: string): Promise<void> {
  const project = await requireProject(env.risktrace_db, run.project_id)
  const documents = await listDocuments(env.risktrace_db, run.project_id)
  const output = parseProviderOutput(content)
  const rawOutputObjectKey = await storeRawProviderOutput(env, run, content)

  if (output.materialAnalysis !== undefined) {
    const analysis = normalizeMaterialAnalysis(output.materialAnalysis, project, documents)
    await persistMaterialAnalysis(env, run, analysis, 'domain_review_running', rawOutputObjectKey)
  }
  if (output.finalReport === undefined) {
    throw new AppError('WORKFLOW_OUTPUT_INVALID', '工作流完成但未返回最终报告', 502)
  }
  const materialAnalysisAvailable =
    output.materialAnalysis !== undefined ||
    (await reviewResultExists(env.risktrace_db, run.id, 'material_analysis'))
  if (!materialAnalysisAvailable) {
    throw new AppError('WORKFLOW_OUTPUT_INVALID', '工作流完成但未保存材料理解结果', 502)
  }

  const report = normalizeReviewReport(output.finalReport, project, documents)
  await persistFinalReport(env, run, report, rawOutputObjectKey)
}

async function persistMaterialAnalysis(
  env: Env,
  run: ReviewRunRow,
  analysis: MaterialAnalysis,
  stage: ReviewStage = 'material_analysis_completed',
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
    stage: laterRunningStage(run.stage, normalizeRunningStage(stage)),
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

async function updateRunningStage(env: Env, run: ReviewRunRow, stage: ReviewStage): Promise<void> {
  if (stage === 'failed' || stage === 'report_completed') {
    return
  }
  const normalizedStage = laterRunningStage(run.stage, normalizeRunningStage(stage))
  const progress = stageProgress(normalizedStage)
  await updateReviewState(env.risktrace_db, {
    reviewRunId: run.id,
    projectId: run.project_id,
    status: 'reviewing',
    stage: normalizedStage,
    providerStatus: 'running',
    progress,
    now: new Date().toISOString(),
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

function laterRunningStage(current: ReviewStage, requested: ReviewStage): ReviewStage {
  const rank: Record<ReviewStage, number> = {
    material_analysis_running: 1,
    material_analysis_completed: 2,
    domain_review_running: 3,
    report_aggregating: 4,
    report_completed: 5,
    failed: 5,
  }

  return rank[current] > rank[requested] ? current : requested
}

function normalizeRunningStage(stage: ReviewStage): ReviewStage {
  if (stage === 'material_analysis_completed') {
    return stage
  }
  if (stage === 'report_aggregating') {
    return stage
  }
  return 'domain_review_running'
}

function stageProgress(stage: ReviewStage): number {
  switch (stage) {
    case 'material_analysis_running':
      return 20
    case 'material_analysis_completed':
      return 40
    case 'domain_review_running':
      return 65
    case 'report_aggregating':
      return 85
    case 'report_completed':
      return 100
    case 'failed':
      return 0
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
      return '正在理解和分类材料'
    case 'material_analysis_completed':
      return '材料理解结果已保存，同一工作流继续审查'
    case 'domain_review_running':
      return '领域 Agent 正在执行合规审查'
    case 'report_aggregating':
      return '正在聚合风险并生成报告'
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
