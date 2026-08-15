export const REVIEW_PROVIDER_NAMES = ['mock', 'xingchen', 'deepseek-harness'] as const

export type ReviewProviderName = (typeof REVIEW_PROVIDER_NAMES)[number]

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
  callbackUrl: string
}

export interface ProviderRunResult {
  state: 'running' | 'succeeded' | 'interrupted' | 'failed'
  /**
   * Provider-neutral review output. It may contain an intermediate materialAnalysis while the run
   * is still running, or the final report once the run succeeds.
   */
  content?: string
  providerMessage?: string
}

export interface ProviderRun {
  executeId: string
  initialResult?: ProviderRunResult
}

/**
 * Stable boundary between RiskTrace review orchestration and any review execution runtime.
 *
 * Concrete implementations own provider selection details, authentication, request envelopes,
 * endpoint paths and response normalization. Business orchestration only depends on this contract.
 */
export interface ReviewProvider {
  readonly name: ReviewProviderName
  createRun(input: CreateReviewRunInput): Promise<ProviderRun>
  getRun(executeId: string): Promise<ProviderRunResult>
  cancelRun(executeId: string): Promise<void>
}
