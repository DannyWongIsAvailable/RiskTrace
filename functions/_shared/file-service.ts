import {
  createDocumentsAndMarkUploading,
  listDocuments,
  markDocumentUploaded,
  requireDocument,
} from './document-repository'
import type { DocumentRow, ProjectRow } from './domain'
import { AppError } from './errors'
import { createId } from './ids'
import { expectArray, expectObject, expectPositiveInteger, expectString, optionalString } from './input'
import { requireProject } from './project-repository'
import { headR2Object } from './r2-object-service'
import { createPresignedR2Url } from './r2-signing'

const MAX_FILES_PER_PROJECT = 30
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024
const MAX_PROJECT_UPLOAD_BYTES = 200 * 1024 * 1024
const UPLOAD_URL_TTL_SECONDS = 15 * 60
const DOWNLOAD_URL_TTL_SECONDS = 2 * 60 * 60
const SHA256_PATTERN = /^[a-f0-9]{64}$/i
const SUPPORTED_EXTENSIONS = new Set([
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'xls',
  'xlsx',
  'csv',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'txt',
  'md',
  'json',
])
const ARCHIVE_EXTENSIONS = new Set(['zip', 'rar', '7z', 'tar', 'gz'])

export interface UploadFileInput {
  fileName: string
  mimeType: string
  sizeBytes: number
  checksumSha256: string | null
}

export function parseUploadFiles(value: unknown): UploadFileInput[] {
  const files = expectArray(value, 'files')
  if (files.length < 1 || files.length > MAX_FILES_PER_PROJECT) {
    throw new AppError(
      'VALIDATION_FAILED',
      `单次必须上传 1 到 ${MAX_FILES_PER_PROJECT} 份材料`,
      422,
    )
  }

  return files.map((item, index) => {
    const record = expectObject(item, `files[${index}]`)
    const fileName = expectString(record.fileName, `files[${index}].fileName`, {
      min: 1,
      max: 255,
    })
    const extension = getExtension(fileName)

    if (ARCHIVE_EXTENSIONS.has(extension)) {
      throw new AppError('UNSUPPORTED_FILE_TYPE', '压缩包需解压后重新上传', 422, {
        fileName,
      })
    }
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      throw new AppError('UNSUPPORTED_FILE_TYPE', '存在当前 Demo 不支持的文件格式', 422, {
        fileName,
      })
    }

    const checksumSha256 = optionalString(
      record.checksumSha256,
      `files[${index}].checksumSha256`,
      { max: 64 },
    )
    if (checksumSha256 && !SHA256_PATTERN.test(checksumSha256)) {
      throw new AppError('VALIDATION_FAILED', '文件校验值格式无效', 422, { fileName })
    }

    return {
      fileName,
      mimeType: expectString(record.mimeType, `files[${index}].mimeType`, {
        min: 1,
        max: 150,
      }),
      sizeBytes: expectPositiveInteger(record.sizeBytes, `files[${index}].sizeBytes`, {
        max: MAX_FILE_SIZE_BYTES,
      }),
      checksumSha256: checksumSha256?.toLowerCase() ?? null,
    }
  })
}

export async function createUploadSession(
  env: Env,
  projectId: string,
  files: UploadFileInput[],
): Promise<{
  projectId: string
  expiresAt: string
  files: Array<{
    documentId: string
    fileName: string
    mimeType: string
    sizeBytes: number
    uploadUrl: string
    method: 'PUT'
    headers: Record<string, string>
  }>
}> {
  const project = await requireProject(env.risktrace_db, projectId)
  assertProjectCanUpload(project)

  const existingDocuments = await listDocuments(env.risktrace_db, projectId)
  const totalFileCount = existingDocuments.length + files.length
  const totalSizeBytes =
    existingDocuments.reduce((sum, document) => sum + document.size_bytes, 0) +
    files.reduce((sum, file) => sum + file.sizeBytes, 0)

  if (totalFileCount > MAX_FILES_PER_PROJECT) {
    throw new AppError('UPLOAD_LIMIT_EXCEEDED', '项目材料数量超过允许上限', 422)
  }
  if (totalSizeBytes > MAX_PROJECT_UPLOAD_BYTES) {
    throw new AppError('UPLOAD_LIMIT_EXCEEDED', '项目材料总大小超过允许上限', 422)
  }

  const now = new Date()
  const nowIso = now.toISOString()
  const expiresAt = new Date(now.getTime() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString()
  const records = files.map((file) => {
    const documentId = createId('doc')
    const safeFileName = sanitizeFileName(file.fileName)
    return {
      id: documentId,
      projectId,
      originalName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      objectKey: `projects/${projectId}/original/${documentId}/${safeFileName}`,
      checksumSha256: file.checksumSha256,
      now: nowIso,
    }
  })

  const signedFiles = await Promise.all(
    records.map(async (record) => ({
      documentId: record.id,
      fileName: record.originalName,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      uploadUrl: await createPresignedR2Url(env, {
        method: 'PUT',
        objectKey: record.objectKey,
        expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
        signedHeaders: {
          'content-type': record.mimeType,
          ...(record.checksumSha256
            ? { 'x-amz-checksum-sha256': hexToBase64(record.checksumSha256) }
            : {}),
        },
        now,
      }),
      method: 'PUT' as const,
      headers: {
        'Content-Type': record.mimeType,
        ...(record.checksumSha256
          ? { 'x-amz-checksum-sha256': hexToBase64(record.checksumSha256) }
          : {}),
      },
    })),
  )

  await createDocumentsAndMarkUploading(env.risktrace_db, projectId, records, nowIso)

  return { projectId, expiresAt, files: signedFiles }
}

export async function confirmDocumentUpload(
  env: Env,
  projectId: string,
  documentId: string,
): Promise<DocumentRow> {
  const document = await requireDocument(env.risktrace_db, projectId, documentId)
  const object = await headR2Object(env, document.r2_object_key)

  if (!object) {
    throw new AppError('DOCUMENT_UPLOAD_INCOMPLETE', '尚未在对象存储中找到该材料', 409)
  }
  if (object.size !== document.size_bytes) {
    throw new AppError('DOCUMENT_SIZE_MISMATCH', '上传材料大小与登记信息不一致', 422)
  }

  if (document.checksum_sha256) {
    const uploadedChecksum = object.checksumSha256Base64
    if (!uploadedChecksum || uploadedChecksum !== hexToBase64(document.checksum_sha256)) {
      throw new AppError('DOCUMENT_CHECKSUM_MISMATCH', '上传材料校验值不一致', 422)
    }
  }

  if (document.upload_status === 'uploaded') {
    return document
  }

  const now = new Date().toISOString()
  return markDocumentUploaded(env.risktrace_db, { projectId, documentId, now })
}

export async function createReviewProviderFileList(
  env: Env,
  documents: DocumentRow[],
): Promise<
  Array<{
    documentId: string
    fileName: string
    mimeType: string
    fileUrl: string
    parseStrategy: 'ocr' | 'table' | 'text'
  }>
> {
  const now = new Date()
  return Promise.all(
    documents.map(async (document) => ({
      documentId: document.id,
      fileName: document.original_name,
      mimeType: document.mime_type,
      fileUrl: await createPresignedR2Url(env, {
        method: 'GET',
        objectKey: document.derived_object_key ?? document.r2_object_key,
        expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
        now,
      }),
      parseStrategy: resolveParseStrategy(document.original_name),
    })),
  )
}

/** @deprecated Use createReviewProviderFileList. */
export const createWorkflowFileList = createReviewProviderFileList

function assertProjectCanUpload(project: ProjectRow): void {
  if (!['draft', 'uploading'].includes(project.status)) {
    throw new AppError('CONFLICTING_STATE', '当前项目状态不允许继续上传材料', 409)
  }
}

function resolveParseStrategy(fileName: string): 'ocr' | 'table' | 'text' {
  const extension = getExtension(fileName)
  if (['xls', 'xlsx', 'csv'].includes(extension)) {
    return 'table'
  }
  if (['txt', 'md', 'json'].includes(extension)) {
    return 'text'
  }
  return 'ocr'
}

function getExtension(fileName: string): string {
  const index = fileName.lastIndexOf('.')
  return index >= 0 ? fileName.slice(index + 1).toLowerCase() : ''
}

function sanitizeFileName(fileName: string): string {
  const normalized = fileName
    .normalize('NFKC')
    .replace(/[\\/\u0000-\u001f\u007f]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()

  const safe = normalized || 'document'
  if (safe.length <= 120) {
    return safe
  }

  const extension = getExtension(safe)
  const suffix = extension ? `.${extension}` : ''
  return `${safe.slice(0, Math.max(1, 120 - suffix.length))}${suffix}`
}

function hexToBase64(value: string): string {
  const bytes = new Uint8Array(value.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? [])
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

