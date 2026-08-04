import type { DocumentRow, ProjectRow, ReviewRunRow } from './domain'

export function serializeProject(project: ProjectRow) {
  return {
    projectId: project.id,
    projectTitle: project.title,
    status: project.status,
    stage: project.stage,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
  }
}

export function serializeDocument(document: DocumentRow) {
  return {
    documentId: document.id,
    projectId: document.project_id,
    fileName: document.original_name,
    mimeType: document.mime_type,
    sizeBytes: document.size_bytes,
    uploadStatus: document.upload_status,
    checksumSha256: document.checksum_sha256,
    materialName: document.material_name,
    category: document.category,
    summary: document.summary,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
  }
}

export function serializeReviewRun(run: ReviewRunRow) {
  return {
    reviewRunId: run.id,
    projectId: run.project_id,
    status: run.status,
    stage: run.stage,
    progress: run.progress,
    attemptCount: run.attempt_count,
    materialAnalysisSavedAt: run.material_analysis_saved_at,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    error:
      run.error_code && run.error_message
        ? {
            code: run.error_code,
            message: run.error_message,
          }
        : null,
  }
}
