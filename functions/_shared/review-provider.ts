export const REVIEW_PROVIDER_NAMES = ['mock', 'xingchen', 'deepseek-harness'] as const

export type ReviewProviderName = (typeof REVIEW_PROVIDER_NAMES)[number]
export type ExternalReviewProviderName = Exclude<ReviewProviderName, 'mock'>

export interface ReviewProviderFile {
  documentId: string
  fileName: string
  mimeType: string
  fileUrl: string
  parseStrategy: 'ocr' | 'table' | 'text'
}

export interface CreateReviewRunInput {
  projectId: string
  reviewRunId: string
  projectTitle: string
  files: ReviewProviderFile[]
  callback: {
    url: string
    token: string
  }
}

export interface ProviderRunResult {
  state: 'running' | 'succeeded' | 'interrupted' | 'failed'
  content?: string
  providerMessage?: string
}

export interface ProviderRun {
  executeId: string
  initialResult?: ProviderRunResult
}

/**
 * Stable boundary between RiskTrace review orchestration and an external agent/workflow runtime.
 *
 * Provider implementations own vendor-specific authentication, request envelopes, endpoint paths
 * and response normalization. The review service only sees this contract.
 */
export interface ReviewProvider {
  readonly name: ExternalReviewProviderName
  createRun(input: CreateReviewRunInput): Promise<ProviderRun>
  getRun(executeId: string): Promise<ProviderRunResult>
  cancelRun(executeId: string): Promise<void>
}
