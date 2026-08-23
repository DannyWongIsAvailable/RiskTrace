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
  attemptNo: number
  files: ReviewProviderFile[]
}

export type ProviderExecutionState =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'interrupted'
  | 'failed'

export interface ProviderRunSnapshot {
  executeId: string
  state: ProviderExecutionState
  /** Provider-neutral final output. A succeeded run must return materialAnalysis + finalReport. */
  content?: string
  providerMessage?: string
}

/**
 * Stable boundary between RiskTrace review orchestration and any review runtime.
 *
 * Synchronous providers may return a terminal snapshot from createRun(). Providers that return
 * queued/running must implement getRun() so RiskTrace can reconcile their state from GET /review.
 */
export interface ReviewProvider {
  readonly name: ReviewProviderName
  createRun(input: CreateReviewRunInput): Promise<ProviderRunSnapshot>
  getRun?(executeId: string): Promise<ProviderRunSnapshot>
}
