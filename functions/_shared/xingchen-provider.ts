import { AppError } from './errors'
import type {
  CreateReviewRunInput,
  ProviderRun,
  ProviderRunResult,
  ReviewProvider,
} from './review-provider'

const DEFAULT_API_BASE_URL = 'https://xingchen-api.xf-yun.com'
const REQUEST_TIMEOUT_MS = 20_000

const START_PATH = '/workflow/v1/async/chat/completions'
const RESULT_PATH = '/workflow/v1/async/chat/result'
const CANCEL_PATH = '/workflow/v1/async/cancel'

interface XingchenResponse {
  code?: unknown
  message?: unknown
  id?: unknown
  data?: unknown
}

/**
 * 讯飞星辰 Workflow Provider。
 *
 * 当前 RiskTrace Demo 使用星辰异步工作流 API：
 * 1. createRun() 启动工作流并保存 execute_id；
 * 2. 工作流内部一次性完成材料理解、领域审查和报告聚合；
 * 3. getRun() 通过 execute_id 查询 End 节点最终结果，最终结果必须同时包含 materialAnalysis 与 finalReport。
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
    // AGENT_USER_INPUT 是星辰工作流开始节点的默认输入。
    // 当前 Workflow 主要使用 PROJECT_* / FILES_JSON；这里仍保留一份完整上下文，便于调试。
    const workflowInput = {
      projectId: input.projectId,
      reviewRunId: input.reviewRunId,
      projectTitle: input.projectTitle,
      files: input.files,
    }

    const response = await this.post(START_PATH, {
      flow_id: this.flowId,
      uid: input.projectId,
      chat_id: compactChatId(input.reviewRunId),
      parameters: {
        AGENT_USER_INPUT: JSON.stringify(workflowInput),
        PROJECT_ID: input.projectId,
        REVIEW_RUN_ID: input.reviewRunId,
        PROJECT_TITLE: input.projectTitle,
        FILES_JSON: JSON.stringify(input.files),

        // 保留尝试编号，便于工作流日志定位；RiskTrace 不再依赖工作流回调。
        ATTEMPT_NO: '1',
      },
    })

    const code = readNumber(response.code)
    const data = readObject(response.data)
    const executeId = readString(data?.execute_id)

    if (code !== 0 || !executeId) {
      const providerMessage = readString(response.message)
      throw new AppError(
        'WORKFLOW_START_FAILED',
        providerMessage ? `合规审查工作流启动失败：${providerMessage}` : '合规审查工作流启动失败',
        502,
      )
    }

    return { executeId }
  }

  async getRun(executeId: string): Promise<ProviderRunResult> {
    const response = await this.post(RESULT_PATH, {
      execute_id: executeId,
    })

    return normalizeXingchenRunResult(response)
  }

  async cancelRun(executeId: string): Promise<void> {
    const response = await this.post(CANCEL_PATH, {
      execute_id: executeId,
    })

    if (readNumber(response.code) !== 0) {
      throw new AppError('WORKFLOW_CANCEL_FAILED', '合规审查工作流取消失败', 502)
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
        throw new AppError(
          'WORKFLOW_PROVIDER_UNAVAILABLE',
          providerMessage ? `讯飞星辰请求失败：${providerMessage}` : '讯飞星辰服务暂时不可用',
          502,
        )
      }

      return record
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AppError('WORKFLOW_PROVIDER_TIMEOUT', '讯飞星辰服务响应超时', 504)
      }

      throw new AppError('WORKFLOW_PROVIDER_UNAVAILABLE', '讯飞星辰服务暂时不可用', 502)
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

/**
 * 将星辰异步结果接口的官方响应结构归一化为 RiskTrace ProviderRunResult。
 *
 * 星辰成功响应的最终业务输出位于：
 * data.output.content
 *
 * content 按星辰协议是字符串；RiskTrace 后续会在 review-service 中将该字符串
 * JSON.parse 为 { materialAnalysis, finalReport } 并执行领域校验。
 */
function normalizeXingchenRunResult(response: XingchenResponse): ProviderRunResult {
  const code = readNumber(response.code)
  const message = readString(response.message) ?? undefined

  if (code !== 0) {
    return {
      state: 'failed',
      providerMessage: message ?? `讯飞星辰返回错误码：${code ?? 'unknown'}`,
    }
  }

  const data = readObject(response.data)
  if (!data) {
    return {
      state: 'failed',
      providerMessage: '讯飞星辰结果响应缺少 data',
    }
  }

  const rawStatus = readString(data.status)
  const status = rawStatus?.toLowerCase()

  if (status === 'running') {
    return { state: 'running' }
  }

  const output = readObject(data.output)
  const contentValue = output?.content
  const content = typeof contentValue === 'string' ? contentValue.trim() : undefined

  if (status === 'success') {
    if (!output) {
      return {
        state: 'failed',
        providerMessage: '讯飞星辰工作流已完成，但结果缺少 data.output',
      }
    }
    if (typeof contentValue !== 'string') {
      return {
        state: 'failed',
        providerMessage: '讯飞星辰工作流已完成，但 data.output.content 不是字符串',
      }
    }
    if (!content) {
      return {
        state: 'failed',
        providerMessage: '讯飞星辰工作流已完成，但结束节点未返回结果内容',
      }
    }

    return {
      state: 'succeeded',
      content,
    }
  }

  if (status === 'interrupt') {
    return {
      state: 'interrupted',
      content,
      providerMessage: message ?? '讯飞星辰工作流进入中断状态',
    }
  }

  return {
    state: 'failed',
    providerMessage: message ?? `未知工作流状态：${rawStatus ?? 'empty'}`,
  }
}
