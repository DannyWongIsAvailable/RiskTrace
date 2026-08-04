export interface CreateReviewRunInput {
  projectId: string
  reviewRunId: string
  parameters: Record<string, unknown>
}

export interface ProviderRun {
  executeId: string
}

export interface ProviderRunResult {
  state: 'running' | 'succeeded' | 'interrupted' | 'failed'
  content?: string
  providerMessage?: string
}

export interface ReviewProvider {
  createRun(input: CreateReviewRunInput): Promise<ProviderRun>
  getRun(executeId: string): Promise<ProviderRunResult>
  cancelRun(executeId: string): Promise<void>
}
