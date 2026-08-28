import type { RiskFindingAttachmentRow, RiskFindingRow } from './domain'
import { AppError } from './errors'
import { createId } from './ids'
import { expectArray, expectObject, expectPositiveInteger, expectString } from './input'
import type { RiskFindingListRow } from './risk-finding-repository'
import {
  completeRiskFindingRecord,
  countRiskFindingAttachments,
  createRiskFindingAttachments,
  listRiskFindingAttachments,
  markRiskFindingAttachmentUploaded,
  requireRiskFinding,
  requireRiskFindingAttachment,
} from './risk-finding-repository'
import { headR2Object } from './r2-object-service'
import { createPresignedR2Url } from './r2-signing'

const MAX_ATTACHMENTS_PER_FINDING = 5
const MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024
const UPLOAD_URL_TTL_SECONDS = 15 * 60

export interface RiskFindingAttachmentInput {
  fileName: string
  mimeType: string
  sizeBytes: number
}

export function parseRiskFindingAttachmentFiles(value: unknown): RiskFindingAttachmentInput[] {
  const files = expectArray(value, 'files')
  if (files.length < 1 || files.length > MAX_ATTACHMENTS_PER_FINDING) {
    throw new AppError(
      'VALIDATION_FAILED',
      `单次必须上传 1 到 ${MAX_ATTACHMENTS_PER_FINDING} 份证明材料`,
      422,
    )
  }

  return files.map((item, index) => {
    const record = expectObject(item, `files[${index}]`)
    return {
      fileName: expectString(record.fileName, `files[${index}].fileName`, {
        min: 1,
        max: 255,
      }),
      mimeType: expectString(record.mimeType, `files[${index}].mimeType`, {
        min: 1,
        max: 150,
      }),
      sizeBytes: expectPositiveInteger(record.sizeBytes, `files[${index}].sizeBytes`, {
        max: MAX_ATTACHMENT_SIZE_BYTES,
      }),
    }
  })
}

export async function createRiskFindingAttachmentUploadSession(
  env: Env,
  findingId: string,
  files: RiskFindingAttachmentInput[],
): Promise<{
  findingId: string
  expiresAt: string
  files: Array<{
    attachmentId: string
    fileName: string
    mimeType: string
    sizeBytes: number
    uploadUrl: string
    method: 'PUT'
    headers: Record<string, string>
  }>
}> {
  const finding = await requirePendingRiskFinding(env.risktrace_db, findingId)
  const existingCount = await countRiskFindingAttachments(env.risktrace_db, findingId)
  if (existingCount + files.length > MAX_ATTACHMENTS_PER_FINDING) {
    throw new AppError(
      'RISK_ATTACHMENT_LIMIT_EXCEEDED',
      `每个风险事项最多保留 ${MAX_ATTACHMENTS_PER_FINDING} 份证明材料`,
      422,
    )
  }

  const now = new Date()
  const nowIso = now.toISOString()
  const expiresAt = new Date(now.getTime() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString()
  const records = files.map((file) => {
    const attachmentId = createId('riskfile')
    return {
      id: attachmentId,
      riskFindingId: finding.id,
      fileName: file.fileName,
      mimeType: file.mimeType || 'application/octet-stream',
      sizeBytes: file.sizeBytes,
      objectKey: `risk-findings/${finding.id}/proof/${attachmentId}/${sanitizeFileName(
        file.fileName,
      )}`,
      now: nowIso,
    }
  })

  const signedFiles = await Promise.all(
    records.map(async (record) => ({
      attachmentId: record.id,
      fileName: record.fileName,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      uploadUrl: await createPresignedR2Url(env, {
        method: 'PUT',
        objectKey: record.objectKey,
        expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
        signedHeaders: { 'content-type': record.mimeType },
        now,
      }),
      method: 'PUT' as const,
      headers: { 'Content-Type': record.mimeType },
    })),
  )

  await createRiskFindingAttachments(env.risktrace_db, records)
  return { findingId, expiresAt, files: signedFiles }
}

export async function confirmRiskFindingAttachmentUpload(
  env: Env,
  findingId: string,
  attachmentId: string,
): Promise<RiskFindingAttachmentRow> {
  await requirePendingRiskFinding(env.risktrace_db, findingId)
  const attachment = await requireRiskFindingAttachment(
    env.risktrace_db,
    findingId,
    attachmentId,
  )
  const object = await headR2Object(env, attachment.r2_object_key)

  if (!object) {
    throw new AppError(
      'RISK_ATTACHMENT_UPLOAD_INCOMPLETE',
      '尚未在对象存储中找到证明材料',
      409,
    )
  }
  if (object.size !== attachment.size_bytes) {
    throw new AppError(
      'RISK_ATTACHMENT_SIZE_MISMATCH',
      '证明材料大小与登记信息不一致',
      422,
    )
  }
  if (attachment.upload_status === 'uploaded') return attachment

  return markRiskFindingAttachmentUploaded(env.risktrace_db, {
    findingId,
    attachmentId,
    now: new Date().toISOString(),
  })
}

export async function completeRiskFinding(
  env: Env,
  input: {
    findingId: string
    dispositionMethod: string
    responsiblePerson: string
    rectificationMeasures: string
    rectificationDescription: string
    rectifiedAt: string
  },
): Promise<{ finding: RiskFindingListRow; attachments: RiskFindingAttachmentRow[] }> {
  await requirePendingRiskFinding(env.risktrace_db, input.findingId)
  const attachments = await listRiskFindingAttachments(env.risktrace_db, [input.findingId])
  if (attachments.length === 0) {
    throw new AppError(
      'RISK_ATTACHMENT_REQUIRED',
      '请至少上传一份证明材料后再提交',
      422,
    )
  }

  const rectifiedDate = new Date(input.rectifiedAt)
  if (Number.isNaN(rectifiedDate.getTime())) {
    throw new AppError('VALIDATION_FAILED', '整改完成时间格式无效', 422)
  }

  const finding = await completeRiskFindingRecord(env.risktrace_db, {
    findingId: input.findingId,
    dispositionMethod: input.dispositionMethod,
    responsiblePerson: input.responsiblePerson,
    rectificationMeasures: input.rectificationMeasures,
    rectificationDescription: input.rectificationDescription,
    rectifiedAt: rectifiedDate.toISOString(),
    now: new Date().toISOString(),
  })

  return { finding, attachments }
}

async function requirePendingRiskFinding(
  db: D1Database,
  findingId: string,
): Promise<RiskFindingRow> {
  const finding = await requireRiskFinding(db, findingId)
  if (finding.status !== 'pending') {
    throw new AppError(
      'RISK_FINDING_ALREADY_COMPLETED',
      '该风险事项已完成处置与整改',
      409,
    )
  }
  return finding
}

function sanitizeFileName(fileName: string): string {
  const normalized = fileName
    .normalize('NFKC')
    .replace(/[\\/\u0000-\u001f\u007f]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()

  return (normalized || 'proof').slice(0, 120)
}
