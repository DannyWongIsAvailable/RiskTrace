<script setup lang="ts">
import { computed } from 'vue'

import type { ReviewActivity, ReviewHarnessEvent } from '@/types/review-activity'

const props = defineProps<{ activity?: ReviewActivity; events: ReviewHarnessEvent[] }>()
const selectedEvents = computed(() => {
  if (!props.activity) return props.events
  const seqs = new Set(props.activity.eventSeqs)
  return props.events.filter((event) => seqs.has(event.seq))
})

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function formatEventTime(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const milliseconds = value < 10_000_000_000 ? value * 1000 : value
  const date = new Date(milliseconds)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  }).format(date)
}

function formatDuration(ms?: number): string {
  if (ms === undefined) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
}
</script>

<template>
  <section class="harness-inspector">
    <div v-if="props.activity" class="harness-inspector__summary">
      <strong>{{ props.activity.title }}</strong>
      <span>
        Turn {{ props.activity.turn ?? '—' }} · Step {{ props.activity.step ?? '—' }} · seq
        {{ props.activity.seq }}
      </span>
      <span>
        开始 {{ formatEventTime(props.activity.startedAt) }} · 耗时
        {{ formatDuration(props.activity.durationMs) }}
      </span>
      <span v-if="props.activity.tool">
        Tool: {{ props.activity.tool.name }} · callId: {{ props.activity.tool.callId }}
      </span>
    </div>
    <el-collapse>
      <el-collapse-item
        v-for="event in selectedEvents"
        :key="event.seq"
        :title="`#${event.seq} · ${event.type} · ${formatEventTime(event.time)}`"
        :name="String(event.seq)"
      >
        <pre>{{ formatJson(event) }}</pre>
      </el-collapse-item>
    </el-collapse>
    <p v-if="selectedEvents.length === 0" class="harness-inspector__empty">暂无技术事件</p>
  </section>
</template>

<style scoped>
.harness-inspector__summary {
  display: grid;
  gap: var(--rt-space-1);
  margin-bottom: var(--rt-space-4);
  color: var(--rt-text-secondary);
  font-size: var(--rt-font-size-xs);
}

.harness-inspector__summary strong {
  color: var(--rt-text-primary);
  font-size: var(--rt-font-size-sm);
}

.harness-inspector pre {
  max-height: 360px;
  margin: 0;
  overflow: auto;
  padding: var(--rt-space-3);
  border-radius: var(--rt-radius-sm);
  background: var(--rt-bg-subtle);
  color: var(--rt-text-secondary);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.harness-inspector__empty {
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-sm);
}
</style>
