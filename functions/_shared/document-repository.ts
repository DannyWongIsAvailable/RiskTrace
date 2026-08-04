import type { DocumentRow, MaterialAnalysis } from './domain'
import { AppError } from './errors'

export interface NewDocumentRecord {
  id: string
  projectId: string
  originalName: string
  mimeType: string
  sizeBytes: number
  objectKey: string
  checksumSha256: string | null
  now: string
}

export async function createDocumentsAndMarkUploading(
  db: D1Database,
  projectId: string,
  documents: NewDocumentRecord[],
  now: string,
): Promise<void> {
  const statements = documents.map((document) =>
    db
      .prepare(
        `INSERT INTO project_documents (
          id, project_id, original_name, mime_type, size_bytes, r2_object_key,
          upload_status, checksum_sha256, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'uploading', ?, ?, ?)`,
      )
      .bind(
        document.id,
        document.projectId,
        document.originalName,
        document.mimeType,
        document.sizeBytes,
        document.objectKey,
        document.checksumSha256,
        document.now,
        document.now,
      ),
  )

  statements.push(
    db
      .prepare(
        `UPDATE projects
         SET status = 'uploading', stage = 'uploading_files', updated_at = ?
         WHERE id = ? AND status IN ('draft', 'uploading')`,
      )
      .bind(now, projectId),
  )

  await db.batch(statements)
}

export async function listDocuments(db: D1Database, projectId: string): Promise<DocumentRow[]> {
  const result = await db
    .prepare(
      `SELECT * FROM project_documents
       WHERE project_id = ?
       ORDER BY created_at ASC, id ASC`,
    )
    .bind(projectId)
    .all<DocumentRow>()

  return result.results
}

export async function requireDocument(
  db: D1Database,
  projectId: string,
  documentId: string,
): Promise<DocumentRow> {
  const document = await db
    .prepare('SELECT * FROM project_documents WHERE id = ? AND project_id = ?')
    .bind(documentId, projectId)
    .first<DocumentRow>()

  if (!document) {
    throw new AppError('DOCUMENT_NOT_FOUND', '未找到上传材料', 404)
  }

  return document
}

export async function markDocumentUploaded(
  db: D1Database,
  input: { projectId: string; documentId: string; now: string },
): Promise<DocumentRow> {
  await db
    .prepare(
      `UPDATE project_documents
       SET upload_status = 'uploaded', updated_at = ?
       WHERE id = ? AND project_id = ?`,
    )
    .bind(input.now, input.documentId, input.projectId)
    .run()

  return requireDocument(db, input.projectId, input.documentId)
}

export async function applyMaterialAnalysisToDocuments(
  db: D1Database,
  projectId: string,
  analysis: MaterialAnalysis,
  now: string,
): Promise<void> {
  const statements = analysis.materials.map((material) =>
    db
      .prepare(
        `UPDATE project_documents
         SET material_name = ?, category = ?, summary = ?, updated_at = ?
         WHERE id = ? AND project_id = ?`,
      )
      .bind(
        material.materialName,
        material.category,
        material.summary,
        now,
        material.documentId,
        projectId,
      ),
  )

  if (statements.length > 0) {
    await db.batch(statements)
  }
}
