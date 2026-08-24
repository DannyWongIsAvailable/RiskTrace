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
  /** Final RiskTrace output returned by the Harness gateway after a completed root turn. */
  content?: string
  /** Public root assistant response retained for diagnostics; not required by business persistence. */
  finalResponse?: string
  providerMessage?: string
  harness?: Record<string, unknown>
}

/**
 * Safe browser-facing projection of one canonical DeepSeek Harness SessionEvent.
 *
 * The Python gateway keeps the complete event JSON losslessly. Pages Functions preserves the
 * official envelope and plugin event vocabulary, but redacts private reasoning, system prompt
 * text, signed URLs and authentication-shaped values before sending events to the browser.
 */
export interface ProviderRunEvent {
  seq: number
  time: number
  type: string
  data: unknown
  ignorable?: true
  sourceEventSeqs?: number[]
  surfaceOp?: 'append' | { op: 'replace'; start: number; end: number }
}

export interface ProviderRunEventPage {
  executeId: string
  sessionId?: string
  events: ProviderRunEvent[]
  nextSeq: number
  hasMore: boolean
}

/**
 * Legacy provider interface kept only so dormant Mock/Xingchen source files continue to compile.
 * The active RiskTrace review path now constructs DeepSeekHarnessReviewProvider directly and no
 * longer selects or branches on REVIEW_PROVIDER.
 */
export interface ReviewProvider {
  readonly name: ReviewProviderName
  createRun(input: CreateReviewRunInput): Promise<ProviderRunSnapshot>
  getRun?(executeId: string): Promise<ProviderRunSnapshot>
  getEvents?(executeId: string, afterSeq: number, limit?: number): Promise<ProviderRunEventPage>
}
