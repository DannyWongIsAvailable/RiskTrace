import type { PaginatedData } from './api'
import type { RiskLevel } from './project'

export type RiskFindingStatus = 'pending' | 'completed'

export interface RiskFindingAttachment {
  attachmentId: string
  findingId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadStatus: 'uploading' | 'uploaded'
  createdAt: string
  updatedAt: string
}

export interface RiskFinding {
  findingId: string
  sourceFindingId: string
  projectId: string
  projectTitle: string
  reviewRunId: string
  title: string
  domain: string
  riskLevel: RiskLevel
  description: string
  recommendation: string
  relatedDocuments: Array<{
    documentId: string
    fileName: string
  }>
  status: RiskFindingStatus
  dispositionMethod: string | null
  responsiblePerson: string | null
  rectificationMeasures: string | null
  rectificationDescription: string | null
  rectifiedAt: string | null
  completedAt: string | null
  attachments: RiskFindingAttachment[]
  createdAt: string
  updatedAt: string
}

export type RiskFindingListData = PaginatedData<RiskFinding>

export interface CompleteRiskFindingInput {
  dispositionMethod: string
  responsiblePerson: string
  rectificationMeasures: string
  rectificationDescription: string
  rectifiedAt: string
}


export interface RiskFindingDispositionSubmission {
  input: CompleteRiskFindingInput
  files: File[]
}

export interface RiskFindingAttachmentUploadSessionFile {
  attachmentId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadUrl: string
  method: 'PUT'
  headers: Record<string, string>
}

export interface RiskFindingAttachmentUploadSession {
  findingId: string
  expiresAt: string
  files: RiskFindingAttachmentUploadSessionFile[]
}
