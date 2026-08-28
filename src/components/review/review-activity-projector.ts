import { getReviewToolPresentation } from '@/constants/review-tool-presentations'
import type {
  ReviewActivity,
  ReviewActivityProjection,
  ReviewActivityStatus,
  ReviewHarnessEvent,
  ReviewStepBoundary,
  ReviewTodoItem,
  ReviewTurnBoundary,
} from '@/types/review-activity'

type UnknownRecord = Record<string, unknown>

function recordOf(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

function integerOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function turnStep(data: unknown, currentTurn: number | null, currentStep: number | null) {
  const record = recordOf(data)
  return {
    turn: integerOf(record?.turn) ?? currentTurn,
    step: integerOf(record?.step) ?? currentStep,
  }
}

function textFromContent(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => {
      const item = recordOf(block)
      return item?.type === 'text' ? stringOf(item.text) ?? '' : ''
    })
    .filter(Boolean)
    .join('\n')
    .trim()
}

function extractAssistantMessageText(data: unknown): string {
  const record = recordOf(data)
  const message = recordOf(record?.message)
  return textFromContent(message?.content)
}

function extractToolResult(data: unknown): {
  callId: string | null
  output: unknown
  isError: boolean
} {
  const record = recordOf(data)
  const message = recordOf(record?.message)
  const source = recordOf(message?.source)
  const blocks = Array.isArray(message?.content) ? message.content : []
  const toolResult = blocks.map(recordOf).find((item) => item?.type === 'tool-result') ?? null
  const callId = stringOf(source?.callId) ?? stringOf(toolResult?.toolCallId)
  const isError = Boolean(record?.error) || toolResult?.isError === true
  const output = toolResult?.content ?? message?.content ?? null
  return { callId, output, isError }
}

function parseArguments(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function summarizeInput(input: unknown): string | undefined {
  const record = recordOf(input)
  if (!record) return typeof input === 'string' ? input.slice(0, 240) : undefined
  const preferred = ['fileName', 'path', 'query', 'keyword', 'url', 'command']
  for (const key of preferred) {
    const value = stringOf(record[key])
    if (value) return value.slice(0, 240)
  }
  return undefined
}

function summarizeOutput(output: unknown): string | undefined {
  if (typeof output === 'string') return output.trim().slice(0, 240) || undefined
  if (!Array.isArray(output)) return undefined
  const text = textFromContent(output)
  return text ? text.slice(0, 240) : undefined
}

function normalizeTodos(value: unknown): ReviewTodoItem[] {
  const record = recordOf(value)
  if (!Array.isArray(record?.todos)) return []
  return record.todos.flatMap((todo) => {
    const item = recordOf(todo)
    const content = stringOf(item?.content)
    const status = stringOf(item?.status)
    if (!content || !['pending', 'in_progress', 'completed'].includes(status ?? '')) return []
    return [{ content, status: status as ReviewTodoItem['status'] }]
  })
}

function turnReasonKind(value: unknown): string | null {
  return stringOf(recordOf(value)?.kind) ?? stringOf(value)
}

function turnEndStatus(reason: string | null): ReviewActivityStatus {
  if (reason === 'completed') return 'completed'
  if (reason === 'error') return 'failed'
  return 'interrupted'
}

function turnEndPresentation(value: unknown): { title: string; summary?: string } {
  const reason = recordOf(value)
  const kind = stringOf(reason?.kind)
  if (kind === 'error') {
    const error = recordOf(reason?.error)
    const message = stringOf(error?.message)
    return { title: 'Harness 执行失败', ...(message ? { summary: message.slice(0, 240) } : {}) }
  }
  if (kind === 'max-tokens') return { title: 'Harness 已达到输出上限' }
  if (kind === 'blocked') return { title: 'Harness 执行被阻止' }
  if (kind === 'aborted') return { title: 'Harness 执行已取消' }
  if (kind === 'interrupted') return { title: 'Harness 执行已中断' }
  return { title: kind ? `Harness Turn 已结束：${kind}` : 'Harness Turn 已中断' }
}

function ensureTurn(
  turns: Map<number, ReviewTurnBoundary>,
  turn: number,
): ReviewTurnBoundary {
  const current = turns.get(turn)
  if (current) return current
  const created: ReviewTurnBoundary = { turn, status: 'running', steps: [] }
  turns.set(turn, created)
  return created
}

function ensureStep(turn: ReviewTurnBoundary, step: number): ReviewStepBoundary {
  const current = turn.steps.find((item) => item.step === step)
  if (current) return current
  const created = { step }
  turn.steps.push(created)
  return created
}

export function projectReviewActivity(events: readonly ReviewHarnessEvent[]): ReviewActivityProjection {
  const ordered = [...new Map(events.map((event) => [event.seq, event])).values()].sort(
    (left, right) => left.seq - right.seq,
  )
  const activities = new Map<string, ReviewActivity>()
  const turns = new Map<number, ReviewTurnBoundary>()
  let todos: ReviewTodoItem[] = []
  let currentTurn: number | null = null
  let currentStep: number | null = null
  let toolCallCount = 0

  for (const event of ordered) {
    const data = recordOf(event.data)

    if (event.type === 'turn/start') {
      const turn = integerOf(data?.turn)
      if (turn !== null) {
        currentTurn = turn
        currentStep = null
        const boundary = ensureTurn(turns, turn)
        boundary.startedAt = event.time
        boundary.status = 'running'
      }
      continue
    }

    if (event.type === 'step/start') {
      const { turn, step } = turnStep(event.data, currentTurn, currentStep)
      if (turn !== null) currentTurn = turn
      if (step !== null) currentStep = step
      if (turn !== null && step !== null) {
        const boundary = ensureStep(ensureTurn(turns, turn), step)
        boundary.startedAt = event.time
        const id = `assistant:${turn}:${step}`
        if (!activities.has(id)) {
          activities.set(id, {
            id,
            seq: event.seq,
            eventSeqs: [event.seq],
            kind: 'assistant',
            turn,
            step,
            status: 'running',
            title: 'AI 正在工作',
            startedAt: event.time,
          })
        }
      }
      continue
    }

    if (event.type === 'assistant/chunk') {
      const { turn, step } = turnStep(event.data, currentTurn, currentStep)
      const chunk = recordOf(data?.chunk)
      const chunkType = stringOf(chunk?.type)
      if (turn === null || step === null || !chunkType) continue
      const id = `assistant:${turn}:${step}`
      const existing = activities.get(id)
      const activity: ReviewActivity = existing ?? {
        id,
        seq: event.seq,
        eventSeqs: [],
        kind: 'assistant',
        turn,
        step,
        status: 'running',
        title: 'AI 正在工作',
        startedAt: event.time,
      }
      activity.eventSeqs.push(event.seq)
      activity.status = 'running'
      if (chunkType === 'text-delta') {
        const delta = stringOf(chunk?.text) ?? ''
        if (delta) activity.summary = `${activity.summary ?? ''}${delta}`
      }
      activities.set(id, activity)
      continue
    }

    if (event.type === 'assistant/message') {
      const { turn, step } = turnStep(event.data, currentTurn, currentStep)
      if (turn === null || step === null) continue
      const id = `assistant:${turn}:${step}`
      const existing = activities.get(id)
      const text = extractAssistantMessageText(event.data)
      const interrupted = data?.interrupted === true
      const activity: ReviewActivity = existing ?? {
        id,
        seq: event.seq,
        eventSeqs: [],
        kind: 'assistant',
        turn,
        step,
        status: 'completed',
        title: 'AI 输出',
        startedAt: event.time,
      }
      activity.eventSeqs.push(event.seq)
      activity.status = interrupted ? 'interrupted' : 'completed'
      activity.title = interrupted ? 'AI 输出已中断' : 'AI 输出'
      if (text) activity.summary = text
      activity.finishedAt = event.time
      activity.durationMs = Math.max(0, event.time - activity.startedAt)
      if (data?.usage !== undefined) activity.usage = data.usage
      activities.set(id, activity)
      continue
    }

    if (event.type === 'tool/call' || event.type === 'tool/code-dispatch-start') {
      const { turn, step } = turnStep(event.data, currentTurn, currentStep)
      const isSubtool = event.type === 'tool/code-dispatch-start'
      const callId = stringOf(isSubtool ? data?.subCallId : data?.callId)
      const name = stringOf(data?.name)
      if (!callId || !name) continue
      const input = parseArguments(data?.arguments)
      const parentCallId = stringOf(data?.parentCallId)
      const presentation = getReviewToolPresentation(name)
      const id = isSubtool ? `subtool:${callId}` : `tool:${callId}`
      activities.set(id, {
        id,
        seq: event.seq,
        eventSeqs: [event.seq],
        kind: 'tool',
        turn,
        step,
        status: 'running',
        title: presentation.title,
        summary: summarizeInput(input),
        startedAt: event.time,
        tool: {
          callId,
          ...(parentCallId ? { parentCallId } : {}),
          name,
          presentationKind: presentation.kind,
          input,
          isSubtool,
        },
      })
      toolCallCount += 1
      continue
    }

    if (event.type === 'tool/result' || event.type === 'tool/code-dispatch') {
      const isSubtool = event.type === 'tool/code-dispatch'
      const result = isSubtool
        ? {
            callId: stringOf(data?.subCallId),
            output: data?.content,
            isError: data?.isError === true,
          }
        : extractToolResult(event.data)
      if (!result.callId) continue
      const id = isSubtool ? `subtool:${result.callId}` : `tool:${result.callId}`
      let activity = activities.get(id)
      if (!activity) {
        const name = stringOf(data?.name) ?? 'unknown'
        const presentation = getReviewToolPresentation(name)
        const { turn, step } = turnStep(event.data, currentTurn, currentStep)
        activity = {
          id,
          seq: event.seq,
          eventSeqs: [],
          kind: 'tool',
          turn,
          step,
          status: result.isError ? 'failed' : 'completed',
          title: presentation.title,
          startedAt: event.time,
          tool: {
            callId: result.callId,
            name,
            presentationKind: presentation.kind,
            isSubtool,
          },
        }
        toolCallCount += 1
      }
      activity.eventSeqs.push(event.seq)
      activity.status = result.isError ? 'failed' : 'completed'
      activity.finishedAt = event.time
      activity.durationMs = Math.max(0, event.time - activity.startedAt)
      activity.summary = summarizeOutput(result.output) ?? activity.summary
      if (activity.tool) {
        activity.tool.output = result.output
        activity.tool.isError = result.isError
      }
      activities.set(id, activity)
      continue
    }

    if (event.type === 'todo/write') {
      todos = normalizeTodos(event.data)
      continue
    }

    if (event.type === 'step/end') {
      const { turn, step } = turnStep(event.data, currentTurn, currentStep)
      if (turn !== null && step !== null) {
        const boundary = ensureStep(ensureTurn(turns, turn), step)
        boundary.finishedAt = event.time
        const assistant = activities.get(`assistant:${turn}:${step}`)
        if (assistant?.status === 'running') {
          assistant.eventSeqs.push(event.seq)
          assistant.status = 'completed'
          assistant.title = 'AI 处理完成'
          assistant.finishedAt = event.time
          assistant.durationMs = Math.max(0, event.time - assistant.startedAt)
        }
      }
      continue
    }

    if (event.type === 'turn/end') {
      const turn = integerOf(data?.turn) ?? currentTurn
      if (turn !== null) {
        const boundary = ensureTurn(turns, turn)
        const reason = turnReasonKind(data?.reason)
        boundary.finishedAt = event.time
        boundary.reason = reason ?? undefined
        boundary.status = turnEndStatus(reason)
        for (const activity of activities.values()) {
          if (activity.turn === turn && activity.status === 'running') {
            activity.eventSeqs.push(event.seq)
            activity.status =
              boundary.status === 'failed'
                ? 'failed'
                : boundary.status === 'completed' && activity.kind === 'assistant'
                  ? 'completed'
                  : 'interrupted'
            if (activity.kind === 'assistant' && activity.status === 'completed') {
              activity.title = 'AI 处理完成'
            }
            activity.finishedAt = event.time
            activity.durationMs = Math.max(0, event.time - activity.startedAt)
          }
        }
        if (reason !== 'completed') {
          const presentation = turnEndPresentation(data?.reason)
          activities.set(`turn-end:${turn}:${event.seq}`, {
            id: `turn-end:${turn}:${event.seq}`,
            seq: event.seq,
            eventSeqs: [event.seq],
            kind: 'error',
            turn,
            step: null,
            status: boundary.status,
            title: presentation.title,
            ...(presentation.summary ? { summary: presentation.summary } : {}),
            startedAt: event.time,
            finishedAt: event.time,
          })
        }
      }
    }
  }

  const activityList = [...activities.values()].sort((left, right) => left.seq - right.seq)
  const turnList = [...turns.values()]
    .map((turn) => ({ ...turn, steps: [...turn.steps].sort((a, b) => a.step - b.step) }))
    .sort((a, b) => a.turn - b.turn)
  const stepCount = turnList.reduce((count, turn) => count + turn.steps.length, 0)

  return {
    activities: activityList,
    todos,
    turns: turnList,
    stats: { turnCount: turnList.length, stepCount, toolCallCount },
    latestActivity: activityList.at(-1),
  }
}
