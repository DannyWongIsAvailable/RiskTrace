import type { ProviderStatus, ReviewRunRow, ReviewStage, ReviewStatus } from './domain'
import { AppError } from './errors'

export async function createOrGetReviewRun(
  db: D1Database,
  input: { id: string; projectId: string; now: string },
): Promise<ReviewRunRow> {
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO review_runs (
          id, project_id, status, stage, provider_status, progress,
          attempt_count, started_at, updated_at
        ) VALUES (?, ?, 'reviewing', 'material_analysis_running', 'pending', 0, 1, ?, ?)`,
      )
      .bind(input.id, input.projectId, input.now, input.now),
    db
      .prepare(
        `UPDATE projects
         SET status = 'reviewing', stage = 'material_analysis_running', updated_at = ?
         WHERE id = ? AND status IN ('draft', 'uploading')`,
      )
      .bind(input.now, input.projectId),
  ])

  return requireReviewRunByProject(db, input.projectId)
}

export async function findReviewRunByProject(
  db: D1Database,
  projectId: string,
): Promise<ReviewRunRow | null> {
  return db
    .prepare('SELECT * FROM review_runs WHERE project_id = ?')
    .bind(projectId)
    .first<ReviewRunRow>()
}

export async function requireReviewRunByProject(
  db: D1Database,
  projectId: string,
): Promise<ReviewRunRow> {
  const run = await findReviewRunByProject(db, projectId)
  if (!run) {
    throw new AppError('REVIEW_RUN_NOT_FOUND', '该项目尚未开始合规审查', 404)
  }

  return run
}

export async function requireReviewRunById(
  db: D1Database,
  reviewRunId: string,
): Promise<ReviewRunRow> {
  const run = await db
    .prepare('SELECT * FROM review_runs WHERE id = ?')
    .bind(reviewRunId)
    .first<ReviewRunRow>()

  if (!run) {
    throw new AppError('REVIEW_RUN_NOT_FOUND', '未找到合规审查运行', 404)
  }

  return run
}

export async function attachProviderExecuteId(
  db: D1Database,
  input: {
    reviewRunId: string
    providerName: 'deepseek-harness'
    executeId: string
    providerStatus: ProviderStatus
    progress: number
    now: string
  },
): Promise<void> {
  const result = await db
    .prepare(
      `UPDATE review_runs
       SET provider_name = ?, provider_execute_id = ?, provider_status = ?, progress = ?, updated_at = ?
       WHERE id = ? AND status = 'reviewing'
         AND (provider_execute_id IS NULL OR provider_execute_id = ?)`,
    )
    .bind(
      input.providerName,
      input.executeId,
      input.providerStatus,
      input.progress,
      input.now,
      input.reviewRunId,
      input.executeId,
    )
    .run()

  if ((result.meta.changes ?? 0) === 1) {
    return
  }

  // Concurrent duplicate submissions may race with a fast reconciliation. If the same executeId
  // was already attached, the operation is idempotently complete even when the business run has
  // meanwhile reached a terminal state.
  const current = await requireReviewRunById(db, input.reviewRunId)
  if (
    current.provider_execute_id === input.executeId &&
    current.provider_name === input.providerName
  ) {
    return
  }

  throw new AppError('CONFLICTING_STATE', '审查运行状态已变化，无法保存 Provider 调用追踪编号', 409)
}

export async function updateProviderStatus(
  db: D1Database,
  input: {
    reviewRunId: string
    projectId: string
    providerStatus: 'starting' | 'running'
    progress: number
    now: string
  },
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `UPDATE review_runs
         SET stage = 'material_analysis_running', provider_status = ?, progress = ?, updated_at = ?
         WHERE id = ? AND project_id = ? AND status = 'reviewing'`,
      )
      .bind(
        input.providerStatus,
        input.progress,
        input.now,
        input.reviewRunId,
        input.projectId,
      ),
    db
      .prepare(
        `UPDATE projects
         SET status = 'reviewing', stage = 'material_analysis_running', updated_at = ?
         WHERE id = ? AND status = 'reviewing'`,
      )
      .bind(input.now, input.projectId),
  ])
}

export async function updateReviewState(
  db: D1Database,
  input: {
    reviewRunId: string
    projectId: string
    status: ReviewStatus
    stage: ReviewStage
    providerStatus: ProviderStatus
    progress: number
    now: string
    errorCode?: string | null
    errorMessage?: string | null
    finishedAt?: string | null
  },
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `UPDATE review_runs
         SET status = ?, stage = ?, provider_status = ?, progress = ?,
             error_code = ?, error_message = ?, finished_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        input.status,
        input.stage,
        input.providerStatus,
        input.progress,
        input.errorCode ?? null,
        input.errorMessage ?? null,
        input.finishedAt ?? null,
        input.now,
        input.reviewRunId,
      ),
    db
      .prepare(
        `UPDATE projects
         SET status = ?, stage = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(input.status, input.stage, input.now, input.projectId),
  ])
}

export async function markMaterialAnalysisSaved(
  db: D1Database,
  input: { reviewRunId: string; projectId: string; now: string },
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `UPDATE review_runs
         SET material_analysis_saved_at = COALESCE(material_analysis_saved_at, ?),
             stage = 'report_aggregating', progress = 0, updated_at = ?
         WHERE id = ? AND project_id = ? AND status = 'reviewing'`,
      )
      .bind(input.now, input.now, input.reviewRunId, input.projectId),
    db
      .prepare(
        `UPDATE projects
         SET status = 'reviewing', stage = 'report_aggregating', updated_at = ?
         WHERE id = ? AND status = 'reviewing'`,
      )
      .bind(input.now, input.projectId),
  ])
}

export async function prepareReviewRetry(
  db: D1Database,
  input: { reviewRunId: string; projectId: string; now: string },
): Promise<void> {
  await db.batch([
    db
      .prepare(
        // provider_name is introduced by migrations/0002_review_provider.sql.
        // noinspection SqlResolve
        `UPDATE review_runs
         SET status = 'reviewing', stage = 'material_analysis_running',
             provider_name = NULL, provider_execute_id = NULL, provider_status = 'pending', progress = 0,
             attempt_count = attempt_count + 1,
             error_code = NULL, error_message = NULL, finished_at = NULL, updated_at = ?
         WHERE id = ? AND status = 'failed'`,
      )
      .bind(input.now, input.reviewRunId),
    db
      .prepare(
        `UPDATE projects
         SET status = 'reviewing', stage = 'material_analysis_running', updated_at = ?
         WHERE id = ?`,
      )
      .bind(input.now, input.projectId),
  ])
}
