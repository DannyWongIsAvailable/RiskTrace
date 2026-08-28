import type {
  ReviewReport,
  RiskFindingAttachmentRow,
  RiskFindingRow,
  RiskFindingStatus,
} from './domain'
import { AppError } from './errors'
import { createId } from './ids'

const INSERT_BATCH_SIZE = 50

export interface RiskFindingListRow extends RiskFindingRow {
  project_title: string
}

export async function syncRiskFindingsForReport(
  db: D1Database,
  input: {
    reviewRunId: string
    projectId: string
    report: ReviewReport
    now: string
  },
): Promise<void> {
  const statements = input.report.findings.map((finding) =>
    db
      .prepare(
        `INSERT INTO risk_findings (
          id, project_id, review_run_id, source_finding_id, title, domain, risk_level,
          description, recommendation, related_documents_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
         ON CONFLICT(review_run_id, source_finding_id) DO UPDATE SET
                                                                   title = excluded.title,
                                                                   domain = excluded.domain,
                                                                   risk_level = excluded.risk_level,
                                                                   description = excluded.description,
                                                                   recommendation = excluded.recommendation,
                                                                   related_documents_json = excluded.related_documents_json,
                                                                   updated_at = CASE
                                                                                  WHEN risk_findings.status = 'pending' THEN excluded.updated_at
                                                                                  ELSE risk_findings.updated_at
                                                                     END`,
      )
      .bind(
        createId('risk'),
        input.projectId,
        input.reviewRunId,
        finding.findingId,
        finding.title,
        finding.domain,
        finding.riskLevel,
        finding.description,
        finding.recommendation,
        JSON.stringify(finding.relatedDocuments),
        input.now,
        input.now,
      ),
  )

  for (let index = 0; index < statements.length; index += INSERT_BATCH_SIZE) {
    await db.batch(statements.slice(index, index + INSERT_BATCH_SIZE))
  }
}

export async function listRiskFindings(
  db: D1Database,
  input: {
    status?: RiskFindingStatus
    pageSize: number
    offset: number
  },
): Promise<{ items: RiskFindingListRow[]; total: number }> {
  const where = input.status ? 'WHERE risk_findings.status = ?' : ''
  const bindings = input.status ? [input.status] : []

  const [itemsResult, countRow] = await Promise.all([
    db
      .prepare(
        `SELECT risk_findings.*, projects.title AS project_title
         FROM risk_findings
                INNER JOIN projects ON projects.id = risk_findings.project_id
           ${where}
         ORDER BY
           (risk_findings.risk_level = 'critical') DESC,
           (risk_findings.risk_level = 'high') DESC,
           (risk_findings.risk_level = 'medium') DESC,
           risk_findings.updated_at DESC,
           risk_findings.id DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(...bindings, input.pageSize, input.offset)
      .all<RiskFindingListRow>(),
    db
      .prepare(`SELECT COUNT(*) AS total FROM risk_findings ${where}`)
      .bind(...bindings)
      .first<{ total: number }>(),
  ])

  return {
    items: itemsResult.results,
    total: countRow?.total ?? 0,
  }
}

export async function requireRiskFinding(
  db: D1Database,
  findingId: string,
): Promise<RiskFindingListRow> {
  const finding = await db
    .prepare(
      `SELECT risk_findings.*, projects.title AS project_title
       FROM risk_findings
              INNER JOIN projects ON projects.id = risk_findings.project_id
       WHERE risk_findings.id = ?`,
    )
    .bind(findingId)
    .first<RiskFindingListRow>()

  if (!finding) {
    throw new AppError('RISK_FINDING_NOT_FOUND', '未找到风险事项', 404)
  }

  return finding
}

export async function listRiskFindingAttachments(
  db: D1Database,
  findingIds: string[],
): Promise<RiskFindingAttachmentRow[]> {
  if (findingIds.length === 0) return []

  const placeholders = findingIds.map(() => '?').join(', ')
  const result = await db
    .prepare(
      `SELECT * FROM risk_finding_attachments
       WHERE risk_finding_id IN (${placeholders})
         AND upload_status = 'uploaded'
       ORDER BY created_at, id`,
    )
    .bind(...findingIds)
    .all<RiskFindingAttachmentRow>()

  return result.results
}

export async function countRiskFindingAttachments(
  db: D1Database,
  findingId: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM risk_finding_attachments
       WHERE risk_finding_id = ?
         AND upload_status = 'uploaded'`,
    )
    .bind(findingId)
    .first<{ total: number }>()

  return row?.total ?? 0
}

export async function createRiskFindingAttachments(
  db: D1Database,
  rows: Array<{
    id: string
    riskFindingId: string
    fileName: string
    mimeType: string
    sizeBytes: number
    objectKey: string
    now: string
  }>,
): Promise<void> {
  if (rows.length === 0) return

  await db.batch(
    rows.map((row) =>
      db
        .prepare(
          `INSERT INTO risk_finding_attachments (
            id, risk_finding_id, file_name, mime_type, size_bytes,
            r2_object_key, upload_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'uploading', ?, ?)`,
        )
        .bind(
          row.id,
          row.riskFindingId,
          row.fileName,
          row.mimeType,
          row.sizeBytes,
          row.objectKey,
          row.now,
          row.now,
        ),
    ),
  )
}

export async function requireRiskFindingAttachment(
  db: D1Database,
  findingId: string,
  attachmentId: string,
): Promise<RiskFindingAttachmentRow> {
  const attachment = await db
    .prepare(
      `SELECT * FROM risk_finding_attachments
       WHERE id = ? AND risk_finding_id = ?`,
    )
    .bind(attachmentId, findingId)
    .first<RiskFindingAttachmentRow>()

  if (!attachment) {
    throw new AppError('RISK_ATTACHMENT_NOT_FOUND', '未找到证明材料', 404)
  }

  return attachment
}

export async function markRiskFindingAttachmentUploaded(
  db: D1Database,
  input: { findingId: string; attachmentId: string; now: string },
): Promise<RiskFindingAttachmentRow> {
  await db
    .prepare(
      `UPDATE risk_finding_attachments
       SET upload_status = 'uploaded', updated_at = ?
       WHERE id = ? AND risk_finding_id = ?`,
    )
    .bind(input.now, input.attachmentId, input.findingId)
    .run()

  return requireRiskFindingAttachment(db, input.findingId, input.attachmentId)
}

export async function completeRiskFindingRecord(
  db: D1Database,
  input: {
    findingId: string
    dispositionMethod: string
    responsiblePerson: string
    rectificationMeasures: string
    rectificationDescription: string
    rectifiedAt: string
    now: string
  },
): Promise<RiskFindingListRow> {
  const result = await db
    .prepare(
      `UPDATE risk_findings
       SET status = 'completed',
           disposition_method = ?,
           responsible_person = ?,
           rectification_measures = ?,
           rectification_description = ?,
           rectified_at = ?,
           completed_at = ?,
           updated_at = ?
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(
      input.dispositionMethod,
      input.responsiblePerson,
      input.rectificationMeasures,
      input.rectificationDescription,
      input.rectifiedAt,
      input.now,
      input.now,
      input.findingId,
    )
    .run()

  if ((result.meta.changes ?? 0) !== 1) {
    const current = await requireRiskFinding(db, input.findingId)
    if (current.status === 'completed') {
      throw new AppError(
        'RISK_FINDING_ALREADY_COMPLETED',
        '该风险事项已完成处置与整改',
        409,
      )
    }
    throw new AppError(
      'RISK_FINDING_UPDATE_CONFLICT',
      '风险事项状态已变化，请刷新后重试',
      409,
    )
  }

  return requireRiskFinding(db, input.findingId)
}
