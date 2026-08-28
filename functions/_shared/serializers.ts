import type {
  DocumentRow,
  ProjectRow,
  ReviewRunRow,
  RiskFindingAttachmentRow,
  RiskFindingRow,
} from './domain'
import type { RiskFindingListRow } from './risk-finding-repository'

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

export function serializeRiskFindingAttachment(attachment: RiskFindingAttachmentRow) {
  return {
    attachmentId: attachment.id,
    findingId: attachment.risk_finding_id,
    fileName: attachment.file_name,
    mimeType: attachment.mime_type,
    sizeBytes: attachment.size_bytes,
    uploadStatus: attachment.upload_status,
    createdAt: attachment.created_at,
    updatedAt: attachment.updated_at,
  }
}

export function serializeRiskFinding(
  finding: RiskFindingRow | RiskFindingListRow,
  attachments: RiskFindingAttachmentRow[],
) {
  return {
    findingId: finding.id,
    sourceFindingId: finding.source_finding_id,
    projectId: finding.project_id,
    projectTitle: 'project_title' in finding ? finding.project_title : '',
    reviewRunId: finding.review_run_id,
    title: finding.title,
    domain: finding.domain,
    riskLevel: finding.risk_level,
    description: finding.description,
    recommendation: finding.recommendation,
    relatedDocuments: parseRelatedDocuments(finding.related_documents_json),
    status: finding.status,
    dispositionMethod: finding.disposition_method,
    responsiblePerson: finding.responsible_person,
    rectificationMeasures: finding.rectification_measures,
    rectificationDescription: finding.rectification_description,
    rectifiedAt: finding.rectified_at,
    completedAt: finding.completed_at,
    attachments: attachments.map(serializeRiskFindingAttachment),
    createdAt: finding.created_at,
    updatedAt: finding.updated_at,
  }
}

function parseRelatedDocuments(value: string): Array<{ documentId: string; fileName: string }> {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []

    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return []
      const record = item as Record<string, unknown>
      if (typeof record.documentId !== 'string' || typeof record.fileName !== 'string') return []
      return [{ documentId: record.documentId, fileName: record.fileName }]
    })
  } catch {
    return []
  }
}
