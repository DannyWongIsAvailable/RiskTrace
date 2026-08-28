<script setup lang="ts">
import { computed } from 'vue'

import HarnessActivityInspector from './HarnessActivityInspector.vue'
import HarnessTodoPlan from './HarnessTodoPlan.vue'
import type { ReviewActivity, ReviewHarnessEvent, ReviewTodoItem } from '@/types/review-activity'

const props = defineProps<{
  status: 'reviewing' | 'completed' | 'failed'
  startedAt?: string | null
  finishedAt?: string | null
  todos: ReviewTodoItem[]
  activity?: ReviewActivity
  events: ReviewHarnessEvent[]
  reviewRunId?: string | null
  runId?: string | null
  sessionId?: string | null
}>()
const emit = defineEmits<{ clearSelection: [] }>()

const modeLabel = computed(() => (props.status === 'reviewing' ? '实时追踪' : '历史回放'))
const displayTodos = computed<ReviewTodoItem[]>(() =>
  props.status === 'completed'
    ? props.todos.map((todo) => ({ ...todo, status: 'completed' as const }))
    : props.todos,
)
const completedTodoCount = computed(() =>
  displayTodos.value.filter((todo) => todo.status === 'completed').length,
)

function shortId(value?: string | null): string {
  if (!value) return '—'
  if (value.length <= 24) return value
  return `${value.slice(0, 12)}...${value.slice(-8)}`
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}
</script>

<template>
  <aside class="harness-sidebar" aria-label="Harness 运行检查器">
    <section class="harness-sidebar__section">
      <h3>Run 概览</h3>
      <dl class="harness-sidebar__facts">
        <div>
          <dt>运行模式</dt>
          <dd>{{ modeLabel }}</dd>
        </div>
        <div>
          <dt>开始时间</dt>
          <dd>{{ formatDateTime(props.startedAt) }}</dd>
        </div>
        <div>
          <dt>结束时间</dt>
          <dd>{{ props.status === 'reviewing' ? '运行中' : formatDateTime(props.finishedAt) }}</dd>
        </div>
        <div>
          <dt>计划完成</dt>
          <dd>{{ displayTodos.length ? `${completedTodoCount}/${displayTodos.length}` : '未提供 Todo' }}</dd>
        </div>
        <div>
          <dt>Review Run</dt>
          <dd :title="props.reviewRunId ?? undefined">{{ shortId(props.reviewRunId) }}</dd>
        </div>
        <div>
          <dt>Harness Run</dt>
          <dd :title="props.runId ?? undefined">{{ shortId(props.runId) }}</dd>
        </div>
        <div>
          <dt>Session</dt>
          <dd :title="props.sessionId ?? undefined">{{ shortId(props.sessionId) }}</dd>
        </div>
      </dl>
    </section>

    <HarnessTodoPlan :todos="displayTodos" />

    <section class="harness-sidebar__section harness-sidebar__inspector">
      <div class="harness-sidebar__title-row">
        <h3>活动检查器</h3>
        <button
          v-if="props.activity"
          type="button"
          class="harness-sidebar__clear"
          @click="emit('clearSelection')"
        >
          清除选择
        </button>
      </div>
      <HarnessActivityInspector
        v-if="props.activity"
        :activity="props.activity"
        :events="props.events"
      />
      <p v-else class="harness-sidebar__empty">
        点击左侧 Assistant、Tool 或错误活动，可在这里查看对应事件、Turn / Step 和调用信息。
      </p>
    </section>
  </aside>
</template>

<style scoped>
.harness-sidebar {
  min-width: 0;
  padding: var(--rt-space-4);
  border-left: 1px solid var(--rt-border-default);
  background: var(--rt-bg-subtle);
}

.harness-sidebar__section + .harness-sidebar__section,
.harness-sidebar__inspector {
  margin-top: var(--rt-space-5);
  padding-top: var(--rt-space-4);
  border-top: 1px solid var(--rt-border-default);
}

.harness-sidebar__section h3 {
  margin: 0 0 var(--rt-space-3);
  color: var(--rt-text-primary);
  font-size: var(--rt-font-size-sm);
}

.harness-sidebar__facts {
  display: grid;
  gap: var(--rt-space-2);
  margin: 0;
}

.harness-sidebar__facts > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--rt-space-3);
}

.harness-sidebar__facts dt,
.harness-sidebar__facts dd {
  margin: 0;
  font-size: var(--rt-font-size-xs);
}

.harness-sidebar__facts dt {
  color: var(--rt-text-tertiary);
}

.harness-sidebar__facts dd {
  color: var(--rt-text-secondary);
  text-align: right;
}

.harness-sidebar__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rt-space-3);
}

.harness-sidebar__clear {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--rt-text-link);
  cursor: pointer;
  font: inherit;
  font-size: var(--rt-font-size-xs);
}

.harness-sidebar__clear:focus-visible {
  outline: 2px solid var(--rt-color-primary-500);
  outline-offset: 2px;
}

.harness-sidebar__empty {
  margin: 0;
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
  line-height: var(--rt-line-height-base);
}

@media (max-width: 980px) {
  .harness-sidebar {
    border-top: 1px solid var(--rt-border-default);
    border-left: 0;
  }
}
</style>
