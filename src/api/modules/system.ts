import { http } from '@/api/request'

export interface HealthInfo {
  appName: string
  environment: string
  status: 'healthy' | 'degraded'
  timestamp: string
}

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

const PROVIDER_CHECK_TIMEOUT_MS = 320_000

export function getHealth(signal?: AbortSignal): Promise<HealthInfo> {
  return http.get<HealthInfo>('/api/health', { signal })
}

export function runProviderCheck(signal?: AbortSignal): Promise<ProviderDiagnosticResult> {
  return http.post<ProviderDiagnosticResult>('/api/provider-check', undefined, {
    signal,
    timeoutMs: PROVIDER_CHECK_TIMEOUT_MS,
  })
}
