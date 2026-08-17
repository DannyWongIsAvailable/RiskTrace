import { AppError } from './errors'
import type {
  CreateReviewRunInput,
  ProviderRun,
  ProviderRunResult,
  ReviewProvider,
} from './review-provider'

const DEFAULT_API_BASE_URL = 'https://xingchen-api.xf-yun.com'
const REQUEST_TIMEOUT_MS = 300_000

const SYNC_PATH = '/workflow/v1/chat/completions'

interface XingchenResponse {
  code?: unknown
  message?: unknown
  id?: unknown
  workflow_step?: unknown
  choices?: unknown
  usage?: unknown
}

/**
 * 讯飞星辰 Workflow Provider。
 *
 * 当前 RiskTrace 使用星辰官方同步 Workflow API：
 * 1. createRun() 调用 /workflow/v1/chat/completions；
 * 2. 工作流内部一次性完成材料理解、领域审查和报告聚合；
 * 3. stream=false 时，最终业务结果从 choices[0].delta.content 读取；
 * 4. createRun() 通过 initialResult 将最终结果直接交给 review-service 落库。
 *
 * ReviewProvider 接口仍保留 getRun/cancelRun，是为了不影响 mock、deepseek-harness
 * 等其他 Provider。星辰同步模式正常完成后不会进入 getRun()。
 */
export class XingchenReviewProvider implements ReviewProvider {
  readonly name = 'xingchen' as const

  private readonly apiBaseUrl: string
  private readonly apiKey: string
  private readonly apiSecret: string
  private readonly flowId: string

  constructor(env: Env) {
    this.apiBaseUrl = (env.XFYUN_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '')

    const apiKey = env.XFYUN_API_KEY?.trim()
    const apiSecret = env.XFYUN_API_SECRET?.trim()
    const flowId = env.XFYUN_FLOW_ID_REVIEW?.trim()

    if (!apiKey || !apiSecret || !flowId) {
      throw new AppError('WORKFLOW_NOT_CONFIGURED', '合规审查服务尚未完成讯飞星辰配置', 500)
    }

    this.apiKey = apiKey
    this.apiSecret = apiSecret
    this.flowId = flowId
  }

  async createRun(input: CreateReviewRunInput): Promise<ProviderRun> {
    const workflowInput = {
      projectId: input.projectId,
      reviewRunId: input.reviewRunId,
      projectTitle: input.projectTitle,
      files: input.files,
    }

    const response = await this.post(SYNC_PATH, {
      flow_id: this.flowId,
      uid: input.projectId,
      parameters: {
        AGENT_USER_INPUT: JSON.stringify(workflowInput),
        PROJECT_ID: input.projectId,
        REVIEW_RUN_ID: input.reviewRunId,
        PROJECT_TITLE: input.projectTitle,
        FILES_JSON: JSON.stringify(input.files),
        ATTEMPT_NO: '1',
      },
      ext: {
        caller: 'workflow',
      },
      stream: false,
    })

    const code = readNumber(response.code)
    const providerMessage = readString(response.message)

    if (code !== 0) {
      throw new AppError(
        'WORKFLOW_EXECUTION_FAILED',
        providerMessage
          ? `讯飞星辰工作流执行失败：${providerMessage}（code=${code ?? 'unknown'}）`
          : `讯飞星辰工作流执行失败（code=${code ?? 'unknown'}）`,
        502,
      )
    }

    const choice = readFirstChoice(response.choices)
    if (!choice) {
      throw new AppError(
        'WORKFLOW_PROVIDER_INVALID_RESPONSE',
        '讯飞星辰同步响应缺少 choices[0]',
        502,
      )
    }

    const finishReason = readString(choice.finish_reason)?.toLowerCase()

    if (finishReason === 'interrupt') {
      throw new AppError(
        'WORKFLOW_INTERRUPTED',
        '讯飞星辰工作流进入了当前流程不支持的人工交互节点',
        502,
      )
    }

    if (finishReason !== 'stop') {
      throw new AppError(
        'WORKFLOW_EXECUTION_FAILED',
        finishReason
          ? `讯飞星辰工作流未正常结束：finish_reason=${finishReason}`
          : '讯飞星辰工作流未返回有效的 finish_reason',
        502,
      )
    }

    const delta = readObject(choice.delta)
    const contentValue = delta?.content

    if (typeof contentValue !== 'string') {
      throw new AppError(
        'WORKFLOW_PROVIDER_INVALID_RESPONSE',
        '讯飞星辰工作流已完成，但 choices[0].delta.content 不是字符串',
        502,
      )
    }

    const content = contentValue.trim()
    if (!content) {
      throw new AppError(
        'WORKFLOW_OUTPUT_INVALID',
        '讯飞星辰工作流已完成，但结束节点未返回结果内容',
        502,
      )
    }

    // 同步接口没有 async execute_id。优先保存星辰响应 id 作为 Provider 调用追踪 ID；
    // 极端情况下缺少 id，则使用 reviewRunId 生成一个仅用于 RiskTrace 内部追踪的 ID。
    const executeId = readString(response.id) ?? `sync-${compactId(input.reviewRunId)}`

    return {
      executeId,
      initialResult: {
        state: 'succeeded',
        content,
      },
    }
  }

  /**
   * 星辰当前采用同步调用。
   *
   * 正常路径中 createRun() 已经带回 initialResult 并完成结果落库，不应再调用 getRun()。
   * 如果由于异常中断导致数据库残留 reviewing 状态，这里明确返回失败，避免再次进入
   * 已废弃的异步轮询逻辑并永久卡住。
   */
  async getRun(_executeId: string): Promise<ProviderRunResult> {
    return {
      state: 'failed',
      providerMessage: '讯飞星辰当前使用同步工作流调用，不支持异步结果查询',
    }
  }

  /**
   * 同步请求返回时工作流已经结束，因此没有可取消的异步任务。
   * 保留空实现以维持统一 ReviewProvider 接口。
   */
  async cancelRun(_executeId: string): Promise<void> {
    return
  }

  private async post(path: string, body: Record<string, unknown>): Promise<XingchenResponse> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(`${this.apiBaseUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}:${this.apiSecret}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      const text = await response.text()
      let value: unknown
      try {
        value = text ? JSON.parse(text) : null
      } catch {
        throw new AppError(
          'WORKFLOW_PROVIDER_INVALID_RESPONSE',
          '讯飞星辰返回了无法解析的响应',
          502,
        )
      }

      const record = readObject(value)
      if (!record) {
        throw new AppError(
          'WORKFLOW_PROVIDER_INVALID_RESPONSE',
          '讯飞星辰响应格式无效',
          502,
        )
      }

      if (!response.ok) {
        const providerMessage = readString(record.message)
        const providerCode = readNumber(record.code)
        throw new AppError(
          'WORKFLOW_PROVIDER_UNAVAILABLE',
          providerMessage
            ? `讯飞星辰请求失败：${providerMessage}${
                providerCode !== null ? `（code=${providerCode}）` : ''
              }`
            : `讯飞星辰服务暂时不可用（HTTP ${response.status}）`,
          502,
        )
      }

      return record
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AppError(
          'WORKFLOW_PROVIDER_TIMEOUT',
          `讯飞星辰同步工作流在 ${REQUEST_TIMEOUT_MS / 1000} 秒内未返回结果`,
          504,
        )
      }

      throw new AppError('WORKFLOW_PROVIDER_UNAVAILABLE', '讯飞星辰服务暂时不可用', 502)
    } finally {
      clearTimeout(timeout)
    }
  }
}

function compactId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '').slice(-48)
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readFirstChoice(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null
  }

  return readObject(value[0])
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
