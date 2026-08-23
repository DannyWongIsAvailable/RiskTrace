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
}

export interface ProviderRunResult {
  state: 'succeeded' | 'interrupted' | 'failed'
  /** Provider-neutral final output. A succeeded run must return materialAnalysis + finalReport. */
  content?: string
  providerMessage?: string
}

export interface ProviderRun {
  /** Provider-side request/run identifier kept only for tracing; RiskTrace never polls it. */
  executeId: string
  /** Synchronous terminal result returned by the same createRun request. */
  result: ProviderRunResult
}

/**
 * Stable synchronous boundary between RiskTrace review orchestration and any review runtime.
 *
 * createRun() must not return until the provider has reached a terminal state. RiskTrace does not
 * poll provider run status and does not expose provider-specific asynchronous lifecycle methods.
 */
export interface ReviewProvider {
  readonly name: ReviewProviderName
  createRun(input: CreateReviewRunInput): Promise<ProviderRun>
}
