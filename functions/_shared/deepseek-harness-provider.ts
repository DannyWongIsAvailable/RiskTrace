import { AppError } from './errors'
import type {
  CreateReviewRunInput,
  ProviderRunSnapshot,
  ReviewProvider,
} from './review-provider'

const CREATE_REQUEST_TIMEOUT_MS = 30_000
const STATUS_REQUEST_TIMEOUT_MS = 15_000
const CONTRACT_VERSION = 'risktrace.review.v1'

/**
 * Asynchronous adapter for the RiskTrace DeepSeek Harness gateway.
 *
 * POST /runs only creates an idempotent background task and should return quickly. GET /runs/{id}
 * reads the current snapshot; queued/running are normal non-terminal states.
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

  async createRun(input: CreateReviewRunInput): Promise<ProviderRunSnapshot> {
    const response = await this.requestJson(
      'POST',
      '/runs',
      {
        contract: CONTRACT_VERSION,
        idempotencyKey: `${input.reviewRunId}:attempt:${input.attemptNo}`,
        project: {
          projectId: input.projectId,
          reviewRunId: input.reviewRunId,
          projectTitle: input.projectTitle,
        },
        files: input.files,
      },
      CREATE_REQUEST_TIMEOUT_MS,
    )

    return normalizeRunSnapshot(response)
  }

  async getRun(executeId: string): Promise<ProviderRunSnapshot> {
    const response = await this.requestJson(
      'GET',
      `/runs/${encodeURIComponent(executeId)}`,
      undefined,
      STATUS_REQUEST_TIMEOUT_MS,
    )
    return normalizeRunSnapshot(response)
  }

  private async requestJson(
    method: 'GET' | 'POST',
    path: string,
    body: Record<string, unknown> | undefined,
    timeoutMs: number,
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

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

      const responseText = await response.text()
      let value: unknown = null
      if (responseText.trim()) {
        try {
          value = JSON.parse(responseText) as unknown
        } catch {
          throw new AppError(
            'WORKFLOW_PROVIDER_INVALID_RESPONSE',
            '合规审查服务响应格式无效',
            502,
          )
        }
      }

      const record = readObject(value)
      if (!response.ok) {
        const remoteMessage =
          readString(record?.detail) ??
          readString(record?.message) ??
          readString(readObject(record?.error)?.message)
        throw new AppError(
          'WORKFLOW_PROVIDER_UNAVAILABLE',
          remoteMessage ? `合规审查服务暂时不可用：${remoteMessage}` : '合规审查服务暂时不可用',
          502,
        )
      }

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

function normalizeRunSnapshot(record: Record<string, unknown>): ProviderRunSnapshot {
  const executeId = readRunId(record)
  const status = readString(record.status)?.toLowerCase()
  const providerMessage =
    readString(record.message) ?? readString(readObject(record.error)?.message) ?? undefined

  if (!executeId) {
    throw new AppError('WORKFLOW_START_FAILED', '合规审查服务未返回运行编号', 502)
  }
  if (!status) {
    throw new AppError('WORKFLOW_PROVIDER_INVALID_RESPONSE', '合规审查服务未返回运行状态', 502)
  }

  if (['queued', 'pending', 'starting'].includes(status)) {
    return { executeId, state: 'queued', providerMessage }
  }
  if (['running', 'in_progress'].includes(status)) {
    return { executeId, state: 'running', providerMessage }
  }
  if (['success', 'succeeded', 'completed', 'complete'].includes(status)) {
    const output = record.output ?? record.result ?? readObject(record.data)?.output
    const content = stringifyProviderContent(output)
    if (!content) {
      throw new AppError('WORKFLOW_OUTPUT_INVALID', '合规审查服务已完成但未返回审查结果', 502)
    }
    return { executeId, state: 'succeeded', content, providerMessage }
  }
  if (['interrupt', 'interrupted', 'requires_action'].includes(status)) {
    return { executeId, state: 'interrupted', providerMessage }
  }
  if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
    return { executeId, state: 'failed', providerMessage }
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
