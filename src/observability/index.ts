import type { App } from 'vue'
import type { Router } from 'vue-router'

export type ErrorSource = 'vue' | 'window' | 'promise' | 'router' | 'api'
export type ErrorSeverity = 'warning' | 'error' | 'fatal'

export interface ErrorReportContext {
  source: ErrorSource
  severity?: ErrorSeverity
  route?: string
  info?: string
  userVisible?: boolean
  metadata?: Record<string, unknown>
}

export interface ObservabilityEvent {
  id: string
  timestamp: string
  source: ErrorSource
  severity: ErrorSeverity
  name: string
  message: string
  stack?: string
  route?: string
  info?: string
  userVisible: boolean
  metadata?: Record<string, unknown>
}

type ErrorListener = (event: ObservabilityEvent) => void

const listeners = new Set<ErrorListener>()
const reportedObjects = new WeakMap<object, ObservabilityEvent>()
let latestEvent: ObservabilityEvent | null = null

function createEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `rt-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeError(error: unknown): Pick<ObservabilityEvent, 'name' | 'message' | 'stack'> {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || '未知错误',
      stack: error.stack,
    }
  }

  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: error,
    }
  }

  try {
    return {
      name: 'UnknownError',
      message: JSON.stringify(error),
    }
  } catch {
    return {
      name: 'UnknownError',
      message: '无法序列化的未知错误',
    }
  }
}

function transportEvent(event: ObservabilityEvent): void {
  const endpoint = import.meta.env.VITE_OBSERVABILITY_ENDPOINT?.trim()

  if (!endpoint || typeof window === 'undefined') {
    return
  }

  const payload = JSON.stringify(event)

  if (typeof navigator.sendBeacon === 'function') {
    const accepted = navigator.sendBeacon(
      endpoint,
      new Blob([payload], { type: 'application/json' }),
    )

    if (accepted) {
      return
    }
  }

  void fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    credentials: 'same-origin',
    keepalive: true,
  }).catch(() => undefined)
}

function publishEvent(event: ObservabilityEvent): void {
  latestEvent = event
  console.error('[RiskTrace observability]', event)
  transportEvent(event)

  listeners.forEach((listener) => {
    try {
      listener(event)
    } catch (listenerError) {
      console.error('[RiskTrace observability listener]', listenerError)
    }
  })
}

export function reportError(
  error: unknown,
  context: ErrorReportContext,
): ObservabilityEvent {
  if (typeof error === 'object' && error !== null) {
    const existing = reportedObjects.get(error)

    if (existing) {
      const shouldEscalate = (context.userVisible ?? true) && !existing.userVisible

      if (!shouldEscalate) {
        return existing
      }

      const escalatedEvent: ObservabilityEvent = {
        ...existing,
        source: context.source,
        severity: context.severity ?? existing.severity,
        route: context.route ?? existing.route,
        info: context.info ?? existing.info,
        userVisible: true,
        metadata: context.metadata ?? existing.metadata,
      }

      reportedObjects.set(error, escalatedEvent)
      publishEvent(escalatedEvent)
      return escalatedEvent
    }
  }

  const normalized = normalizeError(error)
  const event: ObservabilityEvent = {
    id: createEventId(),
    timestamp: new Date().toISOString(),
    source: context.source,
    severity: context.severity ?? 'error',
    name: normalized.name,
    message: normalized.message,
    stack: normalized.stack,
    route: context.route,
    info: context.info,
    userVisible: context.userVisible ?? true,
    metadata: context.metadata,
  }

  if (typeof error === 'object' && error !== null) {
    reportedObjects.set(error, event)
  }

  publishEvent(event)
  return event
}

export function subscribeToErrors(listener: ErrorListener): () => void {
  listeners.add(listener)

  if (latestEvent) {
    listener(latestEvent)
  }

  return () => listeners.delete(listener)
}

export function installGlobalErrorHandling(app: App, router: Router): void {
  app.config.errorHandler = (error, _instance, info) => {
    reportError(error, {
      source: 'vue',
      severity: 'fatal',
      route: router.currentRoute.value.fullPath,
      info,
      userVisible: true,
    })
  }

  router.onError((error, to) => {
    reportError(error, {
      source: 'router',
      severity: 'error',
      route: to.fullPath,
      userVisible: true,
    })
  })

  window.addEventListener('error', (event) => {
    reportError(event.error ?? event.message, {
      source: 'window',
      severity: 'fatal',
      route: router.currentRoute.value.fullPath,
      userVisible: true,
      metadata: {
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
      },
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason, {
      source: 'promise',
      severity: 'error',
      route: router.currentRoute.value.fullPath,
      userVisible: true,
    })
  })
}
