import { normalizeDeepSeekHarnessRunSnapshot } from './deepseek-harness-provider'

export type ProviderDiagnosticLevel = 'info' | 'success' | 'warning' | 'error'
export type ProviderDiagnosticCheckState = 'passed' | 'failed' | 'skipped'

export interface ProviderDiagnosticLogEntry {
  timestamp: string
  level: ProviderDiagnosticLevel
  layer: 'functions' | 'fastapi' | 'harness'
  message: string
  details?: Record<string, unknown>
}

export interface ProviderDiagnosticResult {
  checkId: string
  ok: boolean
  startedAt: string
  finishedAt: string
  durationMs: number
  provider: {
    configuredProvider: string
    baseUrl: string | null
    apiKeyConfigured: boolean
  }
  checks: {
    functions: ProviderDiagnosticCheckState
    fastApi: ProviderDiagnosticCheckState
    asyncApi: ProviderDiagnosticCheckState
    harness: ProviderDiagnosticCheckState
  }
  logs: ProviderDiagnosticLogEntry[]
}

const HEALTH_TIMEOUT_MS = 15_000
const ASYNC_CONTRACT_TIMEOUT_MS = 15_000
const HARNESS_TIMEOUT_MS = 300_000
const MAX_RESPONSE_PREVIEW_LENGTH = 8_000
const EXPECTED_ASYNC_CONTRACT = 'risktrace.harness.async.v1'

function now(): string {
  return new Date().toISOString()
}

function addLog(
  logs: ProviderDiagnosticLogEntry[],
  level: ProviderDiagnosticLevel,
  layer: ProviderDiagnosticLogEntry['layer'],
  message: string,
  details?: Record<string, unknown>,
): void {
  logs.push({
    timestamp: now(),
    level,
    layer,
    message,
    ...(details ? { details } : {}),
  })
}

function normalizeBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/$/, '')
  return trimmed || null
}

function toSafeUrl(value: string | null): string | null {
  if (!value) {
    return null
  }

  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return value
  }
}

function createTimeoutSignal(timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  }
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isDeepSeekHarnessProvider(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return ['deepseek-harness', 'deepseek_harness', 'deepseek'].includes(normalized)
}

function readRemoteLogs(value: unknown): ProviderDiagnosticLogEntry[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    const record = readRecord(item)
    if (!record) {
      return []
    }

    const timestamp = readString(record.timestamp)
    const level = readString(record.level)
    const layer = readString(record.layer)
    const message = readString(record.message)
    const details = readRecord(record.details) ?? undefined

    if (
      !timestamp ||
      !message ||
      !['info', 'success', 'warning', 'error'].includes(level ?? '') ||
      !['fastapi', 'harness'].includes(layer ?? '')
    ) {
      return []
    }

    return [
      {
        timestamp,
        level: level as ProviderDiagnosticLevel,
        layer: layer as 'fastapi' | 'harness',
        message,
        ...(details ? { details } : {}),
      },
    ]
  })
}

function errorDetails(error: unknown): Record<string, unknown> {
  return {
    errorName: error instanceof Error ? error.name : 'UnknownError',
    errorMessage: error instanceof Error ? error.message : String(error),
  }
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const timeout = createTimeoutSignal(timeoutMs)

  try {
    return await fetch(input, {
      ...init,
      signal: timeout.signal,
    })
  } finally {
    timeout.cleanup()
  }
}

function emptyResult(
  checkId: string,
  startedAt: string,
  startedAtMs: number,
  configuredProvider: string,
  safeBaseUrl: string | null,
  apiKey: string | null,
  fastApi: ProviderDiagnosticCheckState,
  asyncApi: ProviderDiagnosticCheckState,
  harness: ProviderDiagnosticCheckState,
  logs: ProviderDiagnosticLogEntry[],
): ProviderDiagnosticResult {
  const finishedAt = now()
  return {
    checkId,
    ok: false,
    startedAt,
    finishedAt,
    durationMs: Date.now() - startedAtMs,
    provider: {
      configuredProvider,
      baseUrl: safeBaseUrl,
      apiKeyConfigured: Boolean(apiKey),
    },
    checks: {
      functions: 'passed',
      fastApi,
      asyncApi,
      harness,
    },
    logs,
  }
}

export async function runProviderDiagnostics(
  env: Env,
  requestId: string,
): Promise<ProviderDiagnosticResult> {
  const startedAtMs = Date.now()
  const startedAt = now()
  const checkId = `provider-check-${crypto.randomUUID()}`
  const logs: ProviderDiagnosticLogEntry[] = []
  const configuredProvider = env.REVIEW_PROVIDER?.trim() || 'mock'
  const providerConfiguredForHarness = isDeepSeekHarnessProvider(configuredProvider)
  const baseUrl = normalizeBaseUrl(env.DEEPSEEK_HARNESS_BASE_URL)
  const safeBaseUrl = toSafeUrl(baseUrl)
  const apiKey = env.DEEPSEEK_HARNESS_API_KEY?.trim() || null
  let fastApiState: ProviderDiagnosticCheckState = 'skipped'
  let asyncApiState: ProviderDiagnosticCheckState = 'skipped'
  let harnessState: ProviderDiagnosticCheckState = 'skipped'

  addLog(logs, 'info', 'functions', 'Provider 检查开始', {
    checkId,
    requestId,
  })
  addLog(logs, 'info', 'functions', '读取 Pages Functions Provider 配置', {
    configuredProvider,
    baseUrl: safeBaseUrl,
    apiKeyConfigured: Boolean(apiKey),
    healthTimeoutMs: HEALTH_TIMEOUT_MS,
    asyncContractTimeoutMs: ASYNC_CONTRACT_TIMEOUT_MS,
    harnessTimeoutMs: HARNESS_TIMEOUT_MS,
  })

  if (!providerConfiguredForHarness) {
    addLog(logs, 'warning', 'functions', '当前 REVIEW_PROVIDER 未配置为 DeepSeek Harness', {
      configuredProvider,
      acceptedValues: ['deepseek-harness', 'deepseek_harness', 'deepseek'],
    })
  }

  if (!baseUrl) {
    addLog(logs, 'error', 'functions', '缺少 DEEPSEEK_HARNESS_BASE_URL，无法继续检查')
    return emptyResult(
      checkId,
      startedAt,
      startedAtMs,
      configuredProvider,
      safeBaseUrl,
      apiKey,
      'failed',
      'skipped',
      'skipped',
      logs,
    )
  }

  const healthUrl = `${baseUrl}/healthz`
  addLog(logs, 'info', 'functions', '开始从 Pages Functions 请求 FastAPI /healthz', {
    target: toSafeUrl(healthUrl),
  })

  try {
    const healthStartedAt = Date.now()
    const response = await fetchWithTimeout(
      healthUrl,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
      HEALTH_TIMEOUT_MS,
    )
    const body = await response.text()

    if (!response.ok) {
      fastApiState = 'failed'
      addLog(logs, 'error', 'functions', 'FastAPI /healthz 返回非 2xx 状态', {
        status: response.status,
        statusText: response.statusText,
        durationMs: Date.now() - healthStartedAt,
        responseBody: body.slice(0, MAX_RESPONSE_PREVIEW_LENGTH),
      })
    } else {
      fastApiState = 'passed'
      addLog(logs, 'success', 'functions', 'Pages Functions 已成功连接 FastAPI', {
        status: response.status,
        durationMs: Date.now() - healthStartedAt,
        responseBody: body.slice(0, MAX_RESPONSE_PREVIEW_LENGTH),
      })
    }
  } catch (error) {
    fastApiState = 'failed'
    addLog(logs, 'error', 'functions', 'Pages Functions 请求 FastAPI /healthz 失败', {
      target: toSafeUrl(healthUrl),
      ...errorDetails(error),
    })
  }

  if (fastApiState !== 'passed') {
    addLog(logs, 'warning', 'functions', 'FastAPI 连通性失败，跳过异步 Run API 与 Harness 模型调用')
    return emptyResult(
      checkId,
      startedAt,
      startedAtMs,
      configuredProvider,
      safeBaseUrl,
      apiKey,
      fastApiState,
      'skipped',
      'skipped',
      logs,
    )
  }

  const asyncContractUrl = `${baseUrl}/diagnostics/async-contract`
  addLog(logs, 'info', 'functions', '开始检查 FastAPI 异步 Run API 契约', {
    target: toSafeUrl(asyncContractUrl),
    expectedContract: EXPECTED_ASYNC_CONTRACT,
  })

  try {
    const asyncStartedAt = Date.now()
    const response = await fetchWithTimeout(
      asyncContractUrl,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
      },
      ASYNC_CONTRACT_TIMEOUT_MS,
    )
    const responseText = await response.text()
    let payload: unknown
    try {
      payload = JSON.parse(responseText) as unknown
    } catch {
      payload = null
    }

    const record = readRecord(payload)
    const service = readRecord(record?.service)
    const sampleRun = readRecord(record?.sampleRun)
    const remoteOk = readBoolean(record?.ok) === true
    const contract = readString(record?.contract)
    const runManagerReady = readBoolean(service?.runManagerReady) === true
    let sampleSnapshotValid = false
    let sampleSnapshotState: string | null = null
    let sampleSnapshotError: string | null = null

    if (sampleRun) {
      try {
        const snapshot = normalizeDeepSeekHarnessRunSnapshot(sampleRun)
        sampleSnapshotValid = snapshot.executeId === 'harnessrun_contract_probe'
        sampleSnapshotState = snapshot.state
      } catch (error) {
        sampleSnapshotError = error instanceof Error ? error.message : String(error)
      }
    }

    const passed =
      response.ok &&
      remoteOk &&
      contract === EXPECTED_ASYNC_CONTRACT &&
      runManagerReady &&
      sampleSnapshotValid &&
      sampleSnapshotState === 'queued'

    asyncApiState = passed ? 'passed' : 'failed'
    addLog(
      logs,
      passed ? 'success' : 'error',
      'functions',
      passed ? 'FastAPI 异步 Run API 契约检查通过' : 'FastAPI 异步 Run API 契约检查失败',
      {
        status: response.status,
        durationMs: Date.now() - asyncStartedAt,
        validation: {
          remoteOk,
          contract,
          expectedContract: EXPECTED_ASYNC_CONTRACT,
          runManagerReady,
          sampleSnapshotValid,
          sampleSnapshotState,
          sampleSnapshotError,
          serviceVersion: readString(service?.version),
        },
        responseBody: passed ? undefined : responseText.slice(0, MAX_RESPONSE_PREVIEW_LENGTH),
      },
    )
  } catch (error) {
    asyncApiState = 'failed'
    addLog(logs, 'error', 'functions', 'Pages Functions 请求 FastAPI 异步 Run API 契约失败', {
      target: toSafeUrl(asyncContractUrl),
      ...errorDetails(error),
    })
  }

  const diagnosticUrl = `${baseUrl}/diagnostics/provider-check`
  addLog(logs, 'info', 'functions', '开始请求 FastAPI Harness 诊断接口', {
    target: toSafeUrl(diagnosticUrl),
  })

  try {
    const harnessStartedAt = Date.now()
    const response = await fetchWithTimeout(
      diagnosticUrl,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          checkId,
          requestId,
          source: 'risktrace-pages-functions',
        }),
      },
      HARNESS_TIMEOUT_MS,
    )
    const responseText = await response.text()
    let payload: unknown

    try {
      payload = JSON.parse(responseText) as unknown
    } catch {
      payload = null
    }

    const payloadRecord = readRecord(payload)
    const remoteLogs = readRemoteLogs(payloadRecord?.logs)
    logs.push(...remoteLogs)

    if (!response.ok) {
      harnessState = 'failed'
      addLog(logs, 'error', 'functions', 'FastAPI Harness 诊断接口返回非 2xx 状态', {
        status: response.status,
        statusText: response.statusText,
        durationMs: Date.now() - harnessStartedAt,
        responseBody: responseText.slice(0, MAX_RESPONSE_PREVIEW_LENGTH),
      })
    } else if (!payloadRecord) {
      harnessState = 'failed'
      addLog(logs, 'error', 'functions', 'FastAPI Harness 诊断接口返回了无效 JSON', {
        durationMs: Date.now() - harnessStartedAt,
        responseBody: responseText.slice(0, MAX_RESPONSE_PREVIEW_LENGTH),
      })
    } else {
      const harnessRecord = readRecord(payloadRecord.harness)
      const remoteOk = readBoolean(payloadRecord.ok) === true
      const harnessOk = readBoolean(harnessRecord?.ok) === true
      const finishReason = readString(harnessRecord?.finishReason)?.toLowerCase() ?? null
      const expectedResponseMatched = readBoolean(harnessRecord?.expectedResponseMatched) === true
      const responseMatchedExactly =
        readString(harnessRecord?.response) === 'RISKTRACE_HARNESS_OK'

      const strictHarnessPassed =
        remoteOk &&
        harnessOk &&
        finishReason === 'completed' &&
        expectedResponseMatched &&
        responseMatchedExactly

      harnessState = strictHarnessPassed ? 'passed' : 'failed'
      addLog(
        logs,
        harnessState === 'passed' ? 'success' : 'error',
        'functions',
        harnessState === 'passed'
          ? 'FastAPI Harness 诊断完成，模型调用严格校验通过'
          : 'FastAPI Harness 诊断完成，但模型调用严格校验未通过',
        {
          status: response.status,
          durationMs: Date.now() - harnessStartedAt,
          validation: {
            remoteOk,
            harnessOk,
            finishReason,
            expectedResponseMatched,
            responseMatchedExactly,
          },
          harness: harnessRecord,
        },
      )
    }
  } catch (error) {
    harnessState = 'failed'
    addLog(logs, 'error', 'functions', 'Pages Functions 请求 Harness 诊断接口失败', {
      target: toSafeUrl(diagnosticUrl),
      ...errorDetails(error),
    })
  }

  const finishedAt = now()
  const ok =
    providerConfiguredForHarness &&
    fastApiState === 'passed' &&
    asyncApiState === 'passed' &&
    harnessState === 'passed'

  addLog(
    logs,
    ok ? 'success' : 'error',
    'functions',
    ok ? 'Provider 全链路检查通过' : 'Provider 全链路检查未通过',
    {
      providerConfiguration: providerConfiguredForHarness ? 'passed' : 'failed',
      fastApi: fastApiState,
      asyncApi: asyncApiState,
      harness: harnessState,
      durationMs: Date.now() - startedAtMs,
    },
  )

  return {
    checkId,
    ok,
    startedAt,
    finishedAt,
    durationMs: Date.now() - startedAtMs,
    provider: {
      configuredProvider,
      baseUrl: safeBaseUrl,
      apiKeyConfigured: Boolean(apiKey),
    },
    checks: {
      functions: 'passed',
      fastApi: fastApiState,
      asyncApi: asyncApiState,
      harness: harnessState,
    },
    logs,
  }
}
