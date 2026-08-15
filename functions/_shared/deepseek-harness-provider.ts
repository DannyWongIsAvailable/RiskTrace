import { AppError } from './errors'
import type {
  CreateReviewRunInput,
  ProviderRun,
  ProviderRunResult,
  ReviewProvider,
} from './review-provider'

const REQUEST_TIMEOUT_MS = 30_000
const CONTRACT_VERSION = 'risktrace.review.v1'

/**
 * Adapter for a DeepSeek-powered agent harness.
 *
 * A harness is intentionally treated as a separate runtime rather than as the raw DeepSeek model
 * API. The runtime only needs to expose the small HTTP contract implemented below; its internal
 * agent/tool orchestration can change without affecting RiskTrace APIs or review orchestration.
 */
export class DeepSeekHarnessReviewProvider implements ReviewProvider {
  readonly name = 'deepseek-harness' as const

  private readonly baseUrl: string
  private readonly apiKey: string | null

  constructor(env: Env) {
    this.baseUrl = env.DEEPSEEK_HARNESS_BASE_URL?.trim().replace(/\/$/, '') ?? ''
    this.apiKey = env.DEEPSEEK_HARNESS_API_KEY?.trim() || null
    if (!this.baseUrl) {
      throw new AppError('WORKFLOW_NOT_CONFIGURED', '合规审查服务尚未完成配置', 500)
    }
  }

  async createRun(input: CreateReviewRunInput): Promise<ProviderRun> {
    const response = await this.request('POST', '/runs', {
      contract: CONTRACT_VERSION,
      idempotencyKey: input.reviewRunId,
      project: {
        projectId: input.projectId,
        reviewRunId: input.reviewRunId,
        projectTitle: input.projectTitle,
      },
      files: input.files,
      callback: {
        url: input.callbackUrl,
      },
    })

    const executeId = readRunId(response)
    if (!executeId) {
      throw new AppError('WORKFLOW_START_FAILED', '合规审查服务未返回运行编号', 502)
    }

    const initialResult = normalizeRunResult(response)
    return {
      executeId,
      ...(initialResult.state === 'running' ? {} : { initialResult }),
    }
  }

  async getRun(executeId: string): Promise<ProviderRunResult> {
    const response = await this.request('GET', `/runs/${encodeURIComponent(executeId)}`)
    return normalizeRunResult(response)
  }

  async cancelRun(executeId: string): Promise<void> {
    await this.request('POST', `/runs/${encodeURIComponent(executeId)}/cancel`, undefined, true)
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
    allowEmptyResponse = false,
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new AppError('WORKFLOW_PROVIDER_UNAVAILABLE', '合规审查服务暂时不可用', 502)
      }

      const responseText = await response.text()
      if (!responseText.trim()) {
        if (allowEmptyResponse) {
          return {}
        }
        throw new AppError(
          'WORKFLOW_PROVIDER_INVALID_RESPONSE',
          '合规审查服务响应格式无效',
          502,
        )
      }

      let value: unknown
      try {
        value = JSON.parse(responseText) as unknown
      } catch {
        throw new AppError(
          'WORKFLOW_PROVIDER_INVALID_RESPONSE',
          '合规审查服务响应格式无效',
          502,
        )
      }
      const record = readObject(value)
      if (!record) {
        throw new AppError(
          'WORKFLOW_PROVIDER_INVALID_RESPONSE',
          '合规审查服务响应格式无效',
          502,
        )
      }
      return readObject(record.data) ?? record
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AppError('WORKFLOW_PROVIDER_TIMEOUT', '合规审查服务响应超时', 504)
      }
      throw new AppError('WORKFLOW_PROVIDER_UNAVAILABLE', '合规审查服务暂时不可用', 502)
    } finally {
      clearTimeout(timeout)
    }
  }
}

function normalizeRunResult(record: Record<string, unknown>): ProviderRunResult {
  const status = readString(record.status)?.toLowerCase() ?? 'running'
  const providerMessage =
    readString(record.message) ?? readString(readObject(record.error)?.message) ?? undefined
  const output = record.output ?? record.result ?? readObject(record.data)?.output
  const content = stringifyProviderContent(output)

  if (['queued', 'pending', 'starting', 'running', 'in_progress'].includes(status)) {
    return { state: 'running', ...(content ? { content } : {}) }
  }
  if (['success', 'succeeded', 'completed', 'complete'].includes(status)) {
    return { state: 'succeeded', content, providerMessage }
  }
  if (['interrupt', 'interrupted', 'requires_action'].includes(status)) {
    return { state: 'interrupted', content, providerMessage }
  }
  if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
    return { state: 'failed', providerMessage }
  }

  throw new AppError('WORKFLOW_PROVIDER_INVALID_RESPONSE', '合规审查服务返回了未知运行状态', 502)
}

function readRunId(record: Record<string, unknown>): string | null {
  return (
    readString(record.executeId) ??
    readString(record.execute_id) ??
    readString(record.runId) ??
    readString(record.run_id) ??
    readString(record.id)
  )
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function stringifyProviderContent(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  return value === undefined ? '' : JSON.stringify(value)
}
