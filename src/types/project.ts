import type { PaginatedData } from './api'

export type ProjectStatus = 'draft' | 'uploading' | 'reviewing' | 'completed' | 'failed'
export type ProjectStage =
  | 'waiting_for_upload'
  | 'uploading_files'
  | 'material_analysis_running'
  | 'material_analysis_completed'
  | 'domain_review_running'
  | 'report_aggregating'
  | 'report_completed'
  | 'failed'
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type CompletenessResult = 'complete' | 'incomplete' | 'uncertain'
export type MaterialCategory =
  | '采购立项与审批'
  | '供应商与寻源'
  | '合同与补充协议'
  | '订单与执行'
  | '交付与验收'
  | '发票与付款'
  | '其他材料'
  | '无法判断'
export type UploadFileStatus = 'queued' | 'uploading' | 'uploaded' | 'failed'

export interface ProjectSummary {
  projectId: string
  projectTitle: string
  status: ProjectStatus
  stage: ProjectStage
  createdAt: string
  updatedAt: string
}

export interface ProjectDocument {
  documentId: string
  projectId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadStatus: 'uploading' | 'uploaded' | 'failed'
  checksumSha256: string | null
  materialName: string | null
  category: string | null
  summary: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectReviewSummary {
  reviewRunId: string
  projectId: string
  status: 'reviewing' | 'completed' | 'failed'
  stage: Exclude<ProjectStage, 'waiting_for_upload' | 'uploading_files'>
  progress: number
  attemptCount: number
  materialAnalysisSavedAt: string | null
  startedAt: string
  finishedAt: string | null
  error: { code: string; message: string } | null
}

export interface ProjectDetail extends ProjectSummary {
  documents: ProjectDocument[]
  review: ProjectReviewSummary | null
}

export type ProjectListData = PaginatedData<ProjectSummary>

export interface CreateProjectInput {
  projectTitle: string
}

export interface UploadSessionFile {
  documentId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadUrl: string
  method: 'PUT'
  headers: Record<string, string>
}

export interface UploadSession {
  projectId: string
  expiresAt: string
  files: UploadSessionFile[]
}

export interface CompleteUploadsResult {
  projectId: string
  reviewRunId: string
  status: 'reviewing' | 'completed' | 'failed'
  stage: Exclude<ProjectStage, 'waiting_for_upload' | 'uploading_files'>
  reviewStatusUrl: string
  materialAnalysisUrl: string
  reportUrl: string
  error: { code: string; message: string } | null
}

export interface ReviewStatusResponse {
  projectId: string
  reviewRunId: string
  status: 'reviewing' | 'completed' | 'failed'
  stage: Exclude<ProjectStage, 'waiting_for_upload' | 'uploading_files'>
  progress: number
  message: string
  materialAnalysisAvailable: boolean
  reportAvailable: boolean
  error?: { code: string; message: string; retryable: boolean }
}

export interface MaterialAnalysis {
  projectTitle: string
  status: 'reviewing'
  stage: 'material_analysis_completed'
  summary: string
  materials: Array<{
    documentId: string
    fileName: string
    materialName: string
    category: MaterialCategory
    summary: string
  }>
  completeness: {
    result: CompletenessResult
    summary: string
    missingMaterials: string[]
  }
}

export interface DeleteProjectResult {
  projectId: string
  deletedDocumentCount: number
}

export interface DeleteProjectDocumentResult {
  projectId: string
  documentId: string
  remainingDocumentCount: number
  projectStatus: ProjectStatus
  projectStage: ProjectStage
}

export interface ReviewReport {
  projectTitle: string
  status: 'completed'
  stage: 'report_completed'
  summary: string
  overallRiskLevel: RiskLevel
  completeness: {
    result: CompletenessResult
    summary: string
    missingMaterials: string[]
  }
  findings: Array<{
    findingId: string
    domain: string
    title: string
    riskLevel: RiskLevel
    description: string
    relatedDocuments: Array<{
      documentId: string
      fileName: string
    }>
    recommendation: string
  }>
  limitations: string[]
}
