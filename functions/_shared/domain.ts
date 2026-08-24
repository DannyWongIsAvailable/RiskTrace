export const PROJECT_STATUSES = ['draft', 'uploading', 'reviewing', 'completed', 'failed'] as const
export const PROJECT_STAGES = [
  'waiting_for_upload',
  'uploading_files',
  'material_analysis_running',
  'material_analysis_completed',
  'domain_review_running',
  'report_aggregating',
  'report_completed',
  'failed',
] as const
export const MATERIAL_CATEGORIES = [
  '采购立项与审批',
  '供应商与寻源',
  '合同与补充协议',
  '订单与执行',
  '交付与验收',
  '发票与付款',
  '其他材料',
  '无法判断',
] as const
export const COMPLETENESS_RESULTS = ['complete', 'incomplete', 'uncertain'] as const
export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const
export const REVIEW_STAGES = [
  'material_analysis_running',
  'material_analysis_completed',
  'domain_review_running',
  'report_aggregating',
  'report_completed',
  'failed',
] as const

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]
export type ProjectStage = (typeof PROJECT_STAGES)[number]
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number]
export type CompletenessResult = (typeof COMPLETENESS_RESULTS)[number]
export type RiskLevel = (typeof RISK_LEVELS)[number]
export type ReviewStage = (typeof REVIEW_STAGES)[number]
export type ReviewStatus = 'reviewing' | 'completed' | 'failed'
export type UploadStatus = 'uploading' | 'uploaded' | 'failed'
export type ProviderStatus =
  | 'pending'
  | 'starting'
  | 'running'
  | 'success'
  | 'interrupt'
  | 'failed'
  | 'cancelled'
export type ReviewResultType = 'material_analysis' | 'final_report'

export interface RequestData extends Record<string, unknown> {
  requestId?: string
}

export interface ProjectRow {
  id: string
  title: string
  status: ProjectStatus
  stage: ProjectStage
  created_at: string
  updated_at: string
}

export interface DocumentRow {
  id: string
  project_id: string
  original_name: string
  mime_type: string
  size_bytes: number
  r2_object_key: string
  derived_object_key: string | null
  upload_status: UploadStatus
  material_name: string | null
  category: MaterialCategory | null
  summary: string | null
  checksum_sha256: string | null
  created_at: string
  updated_at: string
}

export interface ReviewRunRow {
  id: string
  project_id: string
  status: ReviewStatus
  stage: ReviewStage
  provider_name: 'deepseek-harness' | null
  provider_execute_id: string | null
  provider_status: ProviderStatus
  progress: number
  material_analysis_saved_at: string | null
  attempt_count: number
  error_code: string | null
  error_message: string | null
  started_at: string
  finished_at: string | null
  updated_at: string
}

export interface ReviewResultRow {
  id: string
  review_run_id: string
  result_type: ReviewResultType
  schema_version: string
  result_json: string
  raw_output_object_key: string | null
  created_at: string
  updated_at: string
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

export interface ReviewReport {
  projectTitle: string
  status: 'completed'
  stage: 'report_completed'
  summary: string
  overallRiskLevel: RiskLevel
  completeness: MaterialAnalysis['completeness']
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

export interface ReviewStatusResponse {
  projectId: string
  reviewRunId: string
  status: ReviewStatus
  stage: ReviewStage
  progress: number
  message: string
  materialAnalysisAvailable: boolean
  reportAvailable: boolean
  error?: {
    code: string
    message: string
    retryable: boolean
  }
}
