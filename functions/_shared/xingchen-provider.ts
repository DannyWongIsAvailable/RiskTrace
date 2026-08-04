import { AppError } from './errors'
import type {
  CreateReviewRunInput,
  ProviderRun,
  ProviderRunResult,
  ReviewProvider,
} from './review-provider'

const DEFAULT_API_BASE_URL = 'https://xingchen-api.xf-yun.com'
const REQUEST_TIMEOUT_MS = 20_000

interface XingchenResponse {
  code?: unknown
  message?: unknown
  data?: unknown
}

export function createReviewProvider(env: Env): ReviewProvider {
  return new XingchenReviewProvider(env)
}

class XingchenReviewProvider implements ReviewProvider {
  private readonly apiBaseUrl: string
  private readonly apiKey: string
  private readonly apiSecret: string
  private readonly flowId: string

  constructor(env: Env) {
    this.apiBaseUrl = (env.XFYUN_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '')
    this.apiKey = env.XFYUN_API_KEY?.trim()
    this.apiSecret = env.XFYUN_API_SECRET?.trim()
    this.flowId = env.XFYUN_FLOW_ID_REVIEW?.trim()

    if (!this.apiKey || !this.apiSecret || !this.flowId) {
      throw new AppError('WORKFLOW_NOT_CONFIGURED', '讯飞星辰工作流尚未完成配置', 500)
    }
  }

  async createRun(input: CreateReviewRunInput): Promise<ProviderRun> {
    const response = await this.post('/workflow/v1/async/chat/completions', {
      flow_id: this.flowId,
      uid: input.projectId,
      chat_id: compactChatId(input.reviewRunId),
      parameters: input.parameters,
    })
    const code = readNumber(response.code)
    const data = readObject(response.data)
    const executeId = readString(data?.execute_id)

    if (code !== 0 || !executeId) {
      throw new AppError('WORKFLOW_START_FAILED', '合规审查工作流启动失败', 502)
    }

    return { executeId }
  }

  async getRun(executeId: string): Promise<ProviderRunResult> {
    const response = await this.post('/workflow/v1/async/chat/result', {
      execute_id: executeId,
    })
    const code = readNumber(response.code)
    const data = readObject(response.data)
    const status = readString(data?.status)?.toLowerCase()
    const output = readObject(data?.output)
    const content = readString(output?.content) ?? ''
    const message = readString(response.message) ?? undefined

    if (code !== 0) {
      return { state: 'failed', providerMessage: message }
    }

    if (status === 'running') {
      return { state: 'running' }
    }
    if (status === 'success') {
      return { state: 'succeeded', content }
    }
    if (status === 'interrupt') {
      return { state: 'interrupted', content, providerMessage: message }
    }

    return { state: 'failed', providerMessage: message }
  }

  async cancelRun(executeId: string): Promise<void> {
    const response = await this.post('/workflow/v1/async/cancel', {
      execute_id: executeId,
    })
    if (readNumber(response.code) !== 0) {
      throw new AppError('WORKFLOW_CANCEL_FAILED', '工作流取消失败', 502)
    }
  }

  private async post(path: string, body: Record<string, unknown>): Promise<XingchenResponse> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(`${this.apiBaseUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}:${this.apiSecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new AppError('WORKFLOW_PROVIDER_UNAVAILABLE', '工作流服务暂时不可用', 502)
      }

      const value: unknown = await response.json()
      const record = readObject(value)
      if (!record) {
        throw new AppError('WORKFLOW_PROVIDER_INVALID_RESPONSE', '工作流服务响应格式无效', 502)
      }

      return record
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AppError('WORKFLOW_PROVIDER_TIMEOUT', '工作流服务响应超时', 504)
      }

      throw new AppError('WORKFLOW_PROVIDER_UNAVAILABLE', '工作流服务暂时不可用', 502)
    } finally {
      clearTimeout(timeout)
    }
  }
}

function compactChatId(reviewRunId: string): string {
  return reviewRunId.replace(/[^A-Za-z0-9_-]/g, '').slice(-32)
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
