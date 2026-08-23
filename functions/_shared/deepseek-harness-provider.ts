import { AppError } from './errors'
import type {
  CreateReviewRunInput,
  ProviderRun,
  ProviderRunResult,
  ReviewProvider,
} from './review-provider'

const REQUEST_TIMEOUT_MS = 300_000
const CONTRACT_VERSION = 'risktrace.review.v1'

/**
 * Synchronous adapter for the DeepSeek Harness gateway.
 *
 * POST /runs must wait for Harness/model completion and return a terminal status in the same HTTP
 * response. RiskTrace deliberately does not call GET /runs/{id} or a cancel endpoint in the current
 * synchronous phase.
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
    const response = await this.request({
      contract: CONTRACT_VERSION,
      idempotencyKey: input.reviewRunId,
      project: {
        projectId: input.projectId,
        reviewRunId: input.reviewRunId,
        projectTitle: input.projectTitle,
      },
      files: input.files,
    })

    const executeId = readRunId(response)
    if (!executeId) {
      throw new AppError('WORKFLOW_START_FAILED', '合规审查服务未返回运行编号', 502)
    }

    return {
      executeId,
      result: normalizeTerminalRunResult(response),
    }
  }

  private async request(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(`${this.baseUrl}/runs`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new AppError('WORKFLOW_PROVIDER_UNAVAILABLE', '合规审查服务暂时不可用', 502)
      }

      const responseText = await response.text()
      if (!responseText.trim()) {
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

function normalizeTerminalRunResult(record: Record<string, unknown>): ProviderRunResult {
  const status = readString(record.status)?.toLowerCase()
  const providerMessage =
    readString(record.message) ?? readString(readObject(record.error)?.message) ?? undefined
  const output = record.output ?? record.result ?? readObject(record.data)?.output
  const content = stringifyProviderContent(output)

  if (!status) {
    throw new AppError('WORKFLOW_PROVIDER_INVALID_RESPONSE', '合规审查服务未返回运行状态', 502)
  }

  if (['queued', 'pending', 'starting', 'running', 'in_progress'].includes(status)) {
    throw new AppError(
      'WORKFLOW_PROVIDER_INVALID_RESPONSE',
      '合规审查服务返回了非终态结果；当前 RiskTrace 仅支持同步审查',
      502,
    )
  }
  if (['success', 'succeeded', 'completed', 'complete'].includes(status)) {
    if (!content) {
      throw new AppError('WORKFLOW_OUTPUT_INVALID', '合规审查服务已完成但未返回审查结果', 502)
    }
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
