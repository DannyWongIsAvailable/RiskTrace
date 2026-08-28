import { AppError } from './errors'
import type {
  CreateReviewRunInput,
  ProviderRunEvent,
  ProviderEventView,
  ProviderRunEventPage,
  ProviderRunSnapshot,
  ReviewProvider,
} from './review-provider'

const CREATE_REQUEST_TIMEOUT_MS = 30_000
const STATUS_REQUEST_TIMEOUT_MS = 15_000
const EVENTS_REQUEST_TIMEOUT_MS = 15_000
const HISTORICAL_EVENTS_REQUEST_TIMEOUT_MS = 30_000
const CONTRACT_VERSION = 'risktrace.review.v1'
const MAX_EVENT_PAGE_SIZE = 5000
const MAX_BROWSER_STRING_LENGTH = 24_000

/**
 * The only active RiskTrace execution adapter.
 *
 * The wire contract intentionally follows the RiskTrace FastAPI gateway one-to-one:
 * POST /runs, GET /runs/{id}, GET /runs/{id}/events. No provider status aliases are accepted.
 */
export class DeepSeekHarnessReviewProvider implements ReviewProvider {
  readonly name = 'deepseek-harness' as const

  private readonly baseUrl: string
  private readonly apiKey: string | null

  constructor(env: Env) {
    this.baseUrl = env.DEEPSEEK_HARNESS_BASE_URL?.trim().replace(/\/$/, '') ?? ''
    this.apiKey = env.DEEPSEEK_HARNESS_API_KEY?.trim() || null
    if (!this.baseUrl) {
      throw new AppError('WORKFLOW_NOT_CONFIGURED', 'DeepSeek Harness 服务尚未完成配置', 500)
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

    return normalizeDeepSeekHarnessRunSnapshot(response)
  }

  async getRun(executeId: string): Promise<ProviderRunSnapshot> {
    const response = await this.requestJson(
      'GET',
      `/runs/${encodeURIComponent(executeId)}`,
      undefined,
      STATUS_REQUEST_TIMEOUT_MS,
    )
    return normalizeDeepSeekHarnessRunSnapshot(response)
  }

  async getEvents(
    executeId: string,
    afterSeq: number,
    limit = 100,
    view: ProviderEventView = 'raw',
  ): Promise<ProviderRunEventPage> {
    const pageSize = Math.max(1, Math.min(MAX_EVENT_PAGE_SIZE, Math.trunc(limit)))
    const query = new URLSearchParams({
      after: String(afterSeq),
      limit: String(pageSize),
      view,
    })
    const response = await this.requestJson(
      'GET',
      `/runs/${encodeURIComponent(executeId)}/events?${query.toString()}`,
      undefined,
      pageSize > 200 ? HISTORICAL_EVENTS_REQUEST_TIMEOUT_MS : EVENTS_REQUEST_TIMEOUT_MS,
    )
    return normalizeDeepSeekHarnessEventPage(response, executeId)
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
            'DeepSeek Harness 响应格式无效',
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
          remoteMessage ? `DeepSeek Harness 暂时不可用：${remoteMessage}` : 'DeepSeek Harness 暂时不可用',
          502,
        )
      }

      if (!record) {
        throw new AppError(
          'WORKFLOW_PROVIDER_INVALID_RESPONSE',
          'DeepSeek Harness 响应格式无效',
          502,
        )
      }

      return readObject(record.data) ?? record
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AppError('WORKFLOW_PROVIDER_TIMEOUT', 'DeepSeek Harness 响应超时', 504)
      }
      throw new AppError('WORKFLOW_PROVIDER_UNAVAILABLE', 'DeepSeek Harness 暂时不可用', 502)
    } finally {
      clearTimeout(timeout)
    }
  }
}

export function normalizeDeepSeekHarnessRunSnapshot(
  record: Record<string, unknown>,
): ProviderRunSnapshot {
  const executeId = readString(record.runId)
  const status = readString(record.status)
  const providerMessage =
    readString(record.message) ?? readString(readObject(record.error)?.message) ?? undefined
  const harness = readObject(record.harness) ?? undefined
  const finalResponse = typeof record.finalResponse === 'string' ? record.finalResponse : undefined

  if (!executeId) {
    throw new AppError('WORKFLOW_START_FAILED', 'DeepSeek Harness 未返回 runId', 502)
  }
  if (!status) {
    throw new AppError('WORKFLOW_PROVIDER_INVALID_RESPONSE', 'DeepSeek Harness 未返回运行状态', 502)
  }

  switch (status) {
    case 'queued':
      return { executeId, state: 'queued', providerMessage, harness }
    case 'running':
      return { executeId, state: 'running', providerMessage, harness }
    case 'completed': {
      if (record.output === undefined) {
        throw new AppError('WORKFLOW_OUTPUT_INVALID', 'DeepSeek Harness 已完成但未返回 output', 502)
      }
      return {
        executeId,
        state: 'succeeded',
        content: stringifyProviderContent(record.output),
        finalResponse,
        providerMessage,
        harness,
      }
    }
    case 'failed':
      return { executeId, state: 'failed', finalResponse, providerMessage, harness }
    default:
      throw new AppError(
        'WORKFLOW_PROVIDER_INVALID_RESPONSE',
        `DeepSeek Harness 返回了未知运行状态：${status}`,
        502,
      )
  }
}

export function normalizeDeepSeekHarnessEventPage(
  record: Record<string, unknown>,
  expectedExecuteId: string,
): ProviderRunEventPage {
  const executeId = readString(record.runId)
  if (!executeId || executeId !== expectedExecuteId) {
    throw new AppError('WORKFLOW_PROVIDER_INVALID_RESPONSE', 'DeepSeek Harness 返回了错误的 runId', 502)
  }

  const rawEvents = record.events
  if (!Array.isArray(rawEvents)) {
    throw new AppError('WORKFLOW_PROVIDER_INVALID_RESPONSE', 'DeepSeek Harness 未返回事件数组', 502)
  }

  const events = rawEvents.map((event) => normalizeHarnessEvent(event))
  const nextSeq = readCursor(record.nextSeq)
  const hasMore = typeof record.hasMore === 'boolean' ? record.hasMore : null
  const sessionId = readString(record.sessionId) ?? undefined

  if (nextSeq === null || hasMore === null) {
    throw new AppError('WORKFLOW_PROVIDER_INVALID_RESPONSE', 'DeepSeek Harness 事件分页信息无效', 502)
  }

  for (let index = 1; index < events.length; index += 1) {
    if (events[index - 1]!.seq >= events[index]!.seq) {
      throw new AppError('WORKFLOW_PROVIDER_INVALID_RESPONSE', 'DeepSeek Harness 事件序号不是严格递增', 502)
    }
  }

  return {
    executeId,
    ...(sessionId ? { sessionId } : {}),
    events,
    nextSeq,
    hasMore,
  }
}

function normalizeHarnessEvent(value: unknown): ProviderRunEvent {
  const record = readObject(value)
  if (!record) {
    throw new AppError('WORKFLOW_PROVIDER_INVALID_RESPONSE', 'DeepSeek Harness 事件格式无效', 502)
  }

  const seq = readInteger(record.seq)
  const time = readInteger(record.time)
  const type = readString(record.type)
  if (seq === null || time === null || !type || !('data' in record)) {
    throw new AppError('WORKFLOW_PROVIDER_INVALID_RESPONSE', 'DeepSeek Harness 事件字段无效', 502)
  }

  const result: ProviderRunEvent = {
    seq,
    time,
    type,
    data: sanitizeEventData(type, record.data),
  }

  if (record.ignorable === true) {
    result.ignorable = true
  }

  if (record.sourceEventSeqs !== undefined) {
    if (!Array.isArray(record.sourceEventSeqs)) {
      throw new AppError('WORKFLOW_PROVIDER_INVALID_RESPONSE', 'SessionEvent sourceEventSeqs 无效', 502)
    }
    const sourceEventSeqs = record.sourceEventSeqs.map((item) => readInteger(item))
    if (sourceEventSeqs.some((item) => item === null)) {
      throw new AppError('WORKFLOW_PROVIDER_INVALID_RESPONSE', 'SessionEvent sourceEventSeqs 无效', 502)
    }
    result.sourceEventSeqs = sourceEventSeqs as number[]
  }

  if (record.surfaceOp !== undefined) {
    result.surfaceOp = normalizeSurfaceOp(record.surfaceOp)
  }

  return result
}

function normalizeSurfaceOp(value: unknown): ProviderRunEvent['surfaceOp'] {
  if (value === 'append') return 'append'
  const record = readObject(value)
  const start = readInteger(record?.start)
  const end = readInteger(record?.end)
  if (record?.op === 'replace' && start !== null && end !== null) {
    return { op: 'replace', start, end }
  }
  throw new AppError('WORKFLOW_PROVIDER_INVALID_RESPONSE', 'SessionEvent surfaceOp 无效', 502)
}

/**
 * Redact only browser-unsafe material while keeping the event vocabulary and structure intact.
 * The lossless canonical event remains in the Python run_events store.
 */
function sanitizeEventData(type: string, value: unknown): unknown {
  const cloned = sanitizeJson(value, new Set())
  const record = readObject(cloned)
  if (!record) return cloned

  if (type === 'assistant/chunk') {
    const chunk = readObject(record.chunk)
    if (chunk?.type === 'reasoning-delta') {
      return {
        ...record,
        chunk: {
          ...chunk,
          text: '',
        },
      }
    }
  }

  if (type === 'assistant/message') {
    return {
      ...record,
      message: sanitizeMessage(record.message),
    }
  }

  if (type === 'tool/call' && typeof record.arguments === 'string') {
    return {
      ...record,
      arguments: sanitizeJsonString(record.arguments),
    }
  }

  if (type === 'user/message') {
    return sanitizeMessage(record, true)
  }

  if (type === 'request/header') {
    const header = readObject(record.header)
    if (header) {
      const { system: _system, ...safeHeader } = header
      return {
        ...record,
        header: safeHeader,
      }
    }
  }

  return cloned
}

function sanitizeMessage(value: unknown, hideAllContent = false): unknown {
  const record = readObject(value)
  if (!record) return value
  const content = record.content
  if (!Array.isArray(content)) return record

  const safeContent = hideAllContent
    ? []
    : content.flatMap((block) => {
        const blockRecord = readObject(block)
        if (!blockRecord) return []
        if (blockRecord.type === 'reasoning') return []
        return [sanitizeJson(blockRecord, new Set())]
      })

  return {
    ...record,
    content: safeContent,
  }
}

function sanitizeJson(value: unknown, seen: Set<unknown>): unknown {
  if (typeof value === 'string') {
    return sanitizeString(value)
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[circular]'
    seen.add(value)
    const result = value.map((item) => sanitizeJson(item, seen))
    seen.delete(value)
    return result
  }
  const record = readObject(value)
  if (!record) return null
  if (seen.has(record)) return '[circular]'
  seen.add(record)
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(record)) {
    if (isSensitiveKey(key)) {
      result[key] = '[redacted]'
    } else {
      result[key] = sanitizeJson(item, seen)
    }
  }
  seen.delete(record)
  return result
}


function sanitizeJsonString(value: string): string {
  try {
    const parsed = JSON.parse(value) as unknown
    return JSON.stringify(sanitizeJson(parsed, new Set()))
  } catch {
    return sanitizeString(value)
  }
}

function sanitizeString(value: string): string {
  const clipped = value.length > MAX_BROWSER_STRING_LENGTH
    ? `${value.slice(0, MAX_BROWSER_STRING_LENGTH)}…`
    : value

  return clipped.replace(
    /https?:\/\/[^\s"'<>]+/gi,
    (url) => (looksSensitiveUrl(url) ? '[redacted-url]' : url),
  )
}

function looksSensitiveUrl(value: string): boolean {
  const lowered = value.toLowerCase()
  return [
    'x-amz-signature=',
    'x-amz-credential=',
    'x-amz-security-token=',
    'signature=',
    'token=',
    'sig=',
  ].some((marker) => lowered.includes(marker))
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_-]/g, '')
  return [
    'authorization',
    'apikey',
    'apisecret',
    'accesstoken',
    'refreshtoken',
    'password',
    'secret',
    'fileurl',
    'uploadurl',
    'signedurl',
  ].includes(normalized)
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function readCursor(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= -1 ? value : null
}

function stringifyProviderContent(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  return value === undefined ? '' : JSON.stringify(value)
}
