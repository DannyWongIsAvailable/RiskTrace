/** Harness event names are merge-extensible; unknown plugin event types must survive replay. */
export type HarnessEventType = string

export interface ReviewHarnessEvent {
  seq: number
  time: number
  type: HarnessEventType
  data: unknown
  ignorable?: boolean
  sourceEventSeqs?: number[]
  surfaceOp?: unknown
}

export interface ReviewEventPage {
  reviewRunId: string
  runId: string | null
  sessionId: string | null
  events: ReviewHarnessEvent[]
  nextSeq: number
  hasMore: boolean
}

export type ReviewConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
export type ReviewActivityKind = 'assistant' | 'tool' | 'error'
export type ReviewActivityStatus = 'running' | 'completed' | 'failed' | 'interrupted'
export type ReviewToolPresentationKind = 'read' | 'search' | 'execute' | 'fetch' | 'edit' | 'other'

export interface ReviewToolActivity {
  callId: string
  parentCallId?: string
  name: string
  presentationKind: ReviewToolPresentationKind
  input?: unknown
  output?: unknown
  isError?: boolean
  isSubtool?: boolean
}

export interface ReviewActivity {
  id: string
  seq: number
  eventSeqs: number[]
  kind: ReviewActivityKind
  turn: number | null
  step: number | null
  status: ReviewActivityStatus
  title: string
  summary?: string
  startedAt: number
  finishedAt?: number
  durationMs?: number
  usage?: unknown
  tool?: ReviewToolActivity
}

export interface ReviewTodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

export interface ReviewStepBoundary {
  step: number
  startedAt?: number
  finishedAt?: number
}

export interface ReviewTurnBoundary {
  turn: number
  startedAt?: number
  finishedAt?: number
  status: ReviewActivityStatus
  reason?: string
  steps: ReviewStepBoundary[]
}

export interface ReviewActivityStats {
  turnCount: number
  stepCount: number
  toolCallCount: number
}

export interface ReviewActivityProjection {
  activities: ReviewActivity[]
  todos: ReviewTodoItem[]
  turns: ReviewTurnBoundary[]
  stats: ReviewActivityStats
  latestActivity?: ReviewActivity
}
