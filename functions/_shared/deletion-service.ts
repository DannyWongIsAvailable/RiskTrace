import type { ProjectStage, ProjectStatus, ProviderStatus } from './domain'
import { AppError } from './errors'
import { requireProject } from './project-repository'

interface StoredDocumentRow {
  id: string
  r2_object_key: string
  derived_object_key: string | null
}

interface StoredResultRow {
  raw_output_object_key: string | null
}

interface ReviewStateRow {
  provider_status: ProviderStatus
}

const ACTIVE_PROVIDER_STATUSES: ReadonlySet<ProviderStatus> = new Set([
  'pending',
  'starting',
  'running',
])

export interface DeleteProjectResult {
  projectId: string
  deletedDocumentCount: number
}

export interface DeleteOperation<T> {
  result: T
  objectKeys: string[]
}

export interface DeleteDocumentResult {
  projectId: string
  documentId: string
  remainingDocumentCount: number
  projectStatus: ProjectStatus
  projectStage: ProjectStage
}

async function listProjectDocuments(
  db: D1Database,
  projectId: string,
): Promise<StoredDocumentRow[]> {
  const result = await db
    .prepare(
      `SELECT id, r2_object_key, derived_object_key
       FROM project_documents
       WHERE project_id = ?
       ORDER BY created_at, id`,
    )
    .bind(projectId)
    .all<StoredDocumentRow>()

  return result.results
}

async function listProjectResultObjects(
  db: D1Database,
  projectId: string,
): Promise<StoredResultRow[]> {
  const result = await db
    .prepare(
      `SELECT review_results.raw_output_object_key
       FROM review_results
       INNER JOIN review_runs ON review_runs.id = review_results.review_run_id
       WHERE review_runs.project_id = ?
         AND review_results.raw_output_object_key IS NOT NULL`,
    )
    .bind(projectId)
    .all<StoredResultRow>()

  return result.results
}

async function assertReviewCanBeDeleted(db: D1Database, projectId: string): Promise<void> {
  const review = await db
    .prepare('SELECT provider_status FROM review_runs WHERE project_id = ?')
    .bind(projectId)
    .first<ReviewStateRow>()

  if (review && ACTIVE_PROVIDER_STATUSES.has(review.provider_status)) {
    throw new AppError(
      'PROJECT_REVIEW_IN_PROGRESS',
      '项目正在执行合规审查，请等待审查结束后再删除',
      409,
    )
  }
}

function collectObjectKeys(
  documents: StoredDocumentRow[],
  results: StoredResultRow[] = [],
): string[] {
  const keys = new Set<string>()

  for (const document of documents) {
    keys.add(document.r2_object_key)
    if (document.derived_object_key) keys.add(document.derived_object_key)
  }

  for (const result of results) {
    if (result.raw_output_object_key) keys.add(result.raw_output_object_key)
  }

  return [...keys]
}

function getResetProjectState(remainingDocumentCount: number): {
  status: ProjectStatus
  stage: ProjectStage
} {
  return remainingDocumentCount > 0
    ? { status: 'uploading', stage: 'uploading_files' }
    : { status: 'draft', stage: 'waiting_for_upload' }
}

export async function deleteProjectWithFiles(
  env: Env,
  projectId: string,
): Promise<DeleteOperation<DeleteProjectResult>> {
  await requireProject(env.risktrace_db, projectId)
  await assertReviewCanBeDeleted(env.risktrace_db, projectId)

  const [documents, resultObjects] = await Promise.all([
    listProjectDocuments(env.risktrace_db, projectId),
    listProjectResultObjects(env.risktrace_db, projectId),
  ])

  const objectKeys = collectObjectKeys(documents, resultObjects)

  const statements = await env.risktrace_db.batch([
    env.risktrace_db
      .prepare(
        `DELETE FROM review_results
         WHERE review_run_id IN (SELECT id FROM review_runs WHERE project_id = ?)`,
      )
      .bind(projectId),
    env.risktrace_db.prepare('DELETE FROM review_runs WHERE project_id = ?').bind(projectId),
    env.risktrace_db
      .prepare('DELETE FROM project_documents WHERE project_id = ?')
      .bind(projectId),
    env.risktrace_db.prepare('DELETE FROM projects WHERE id = ?').bind(projectId),
  ])

  const projectDeleteResult = statements.at(-1)
  if ((projectDeleteResult?.meta.changes ?? 0) !== 1) {
    throw new AppError('PROJECT_DELETE_CONFLICT', '项目状态已变化，请刷新后重试', 409)
  }

  return {
    result: {
      projectId,
      deletedDocumentCount: documents.length,
    },
    objectKeys,
  }
}

export async function deleteProjectDocumentWithFile(
  env: Env,
  projectId: string,
  documentId: string,
): Promise<DeleteOperation<DeleteDocumentResult>> {
  await requireProject(env.risktrace_db, projectId)
  await assertReviewCanBeDeleted(env.risktrace_db, projectId)

  const [documents, resultObjects] = await Promise.all([
    listProjectDocuments(env.risktrace_db, projectId),
    listProjectResultObjects(env.risktrace_db, projectId),
  ])
  const document = documents.find((item) => item.id === documentId)

  if (!document) {
    throw new AppError('DOCUMENT_NOT_FOUND', '未找到项目材料', 404)
  }

  const objectKeys = collectObjectKeys([document], resultObjects)

  const remainingDocumentCount = documents.length - 1
  const nextState = getResetProjectState(remainingDocumentCount)
  const now = new Date().toISOString()
  const statements = await env.risktrace_db.batch([
    env.risktrace_db
      .prepare(
        `DELETE FROM review_results
         WHERE review_run_id IN (SELECT id FROM review_runs WHERE project_id = ?)`,
      )
      .bind(projectId),
    env.risktrace_db.prepare('DELETE FROM review_runs WHERE project_id = ?').bind(projectId),
    env.risktrace_db
      .prepare('DELETE FROM project_documents WHERE id = ? AND project_id = ?')
      .bind(documentId, projectId),
    env.risktrace_db
      .prepare(
        `UPDATE projects
         SET status = ?, stage = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(nextState.status, nextState.stage, now, projectId),
  ])

  const documentDeleteResult = statements[2]
  if ((documentDeleteResult?.meta.changes ?? 0) !== 1) {
    throw new AppError('DOCUMENT_DELETE_CONFLICT', '文件状态已变化，请刷新后重试', 409)
  }

  return {
    result: {
      projectId,
      documentId,
      remainingDocumentCount,
      projectStatus: nextState.status,
      projectStage: nextState.stage,
    },
    objectKeys,
  }
}
