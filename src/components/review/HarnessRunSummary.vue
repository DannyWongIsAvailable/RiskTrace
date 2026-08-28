<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { ReviewActivityProjection, ReviewConnectionState } from '@/types/review-activity'
import type { StatusTone } from '@/types/ui'

const props = defineProps<{
  status: 'reviewing' | 'completed' | 'failed'
  startedAt?: string | null
  finishedAt?: string | null
  projection: ReviewActivityProjection
  eventCount: number
  connectionState: ReviewConnectionState
  connectionMessage?: string
  reportReady: boolean
}>()
const emit = defineEmits<{ viewReport: [] }>()

const now = ref(Date.now())
let clock: number | undefined

const isHistorical = computed(() => props.status !== 'reviewing')
const statusLabel = computed(() =>
  props.status === 'reviewing' ? '运行中' : props.status === 'completed' ? '已完成' : '失败',
)
const statusTone = computed<StatusTone>(() =>
  props.status === 'completed' ? 'success' : props.status === 'failed' ? 'danger' : 'primary',
)
const modeLabel = computed(() => (isHistorical.value ? '历史回放' : '实时追踪'))
const elapsed = computed(() => {
  if (!props.startedAt) return '—'
  const start = Date.parse(props.startedAt)
  const finish = props.finishedAt ? Date.parse(props.finishedAt) : now.value
  if (!Number.isFinite(start) || !Number.isFinite(finish)) return '—'
  const seconds = Math.max(0, Math.floor((finish - start) / 1000))
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const parts = [hours, minutes % 60, seconds % 60].map((value) =>
    String(value).padStart(2, '0'),
  )
  return hours > 0 ? parts.join(':') : parts.slice(1).join(':')
})
const connectionLabel = computed(() => {
  if (isHistorical.value) {
    return props.eventCount > 0
      ? `历史轨迹已载入 · ${props.eventCount} 条关键事件`
      : '暂无可回放的 Harness 事件'
  }
  switch (props.connectionState) {
    case 'connected':
      return '实时轨迹已连接'
    case 'connecting':
      return '正在连接实时轨迹'
    case 'reconnecting':
      return '轨迹暂时断开，正在重连'
    case 'disconnected':
      return '实时轨迹不可用'
  }
})

onMounted(() => {
  clock = window.setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onBeforeUnmount(() => {
  if (clock !== undefined) window.clearInterval(clock)
})
</script>

<template>
  <section class="harness-summary" aria-label="Agent 运行摘要">
    <div class="harness-summary__header">
      <div class="harness-summary__heading">
        <div class="harness-summary__title-row">
          <h2>Agent 工作台</h2>
          <StatusTag :label="statusLabel" :tone="statusTone" />
          <span class="harness-summary__mode">{{ modeLabel }}</span>
        </div>
        <p class="harness-summary__latest">
          最近活动：{{ props.projection.latestActivity?.title ?? '等待 Harness 产生可展示事件' }}
          <template v-if="props.projection.latestActivity?.summary">
            · {{ props.projection.latestActivity.summary }}
          </template>
        </p>
      </div>
      <el-button v-if="props.reportReady" type="primary" @click="emit('viewReport')">
        查看审查报告
      </el-button>
    </div>

    <div class="harness-summary__metrics">
      <div class="harness-summary__metric">
        <span>{{ props.status === 'reviewing' ? '已运行' : '总用时' }}</span>
        <strong>{{ elapsed }}</strong>
      </div>
      <div class="harness-summary__metric">
        <span>Turn</span>
        <strong>{{ props.projection.stats.turnCount }}</strong>
      </div>
      <div class="harness-summary__metric">
        <span>Step</span>
        <strong>{{ props.projection.stats.stepCount }}</strong>
      </div>
      <div class="harness-summary__metric">
        <span>Tool</span>
        <strong>{{ props.projection.stats.toolCallCount }}</strong>
      </div>
      <div class="harness-summary__metric">
        <span>轨迹事件</span>
        <strong>{{ props.eventCount }}</strong>
      </div>
    </div>

    <div
      class="harness-summary__connection"
      :class="[`is-${props.connectionState}`, { 'is-history': isHistorical }]"
    >
      {{ connectionLabel }}
      <template v-if="props.connectionMessage"> · {{ props.connectionMessage }}</template>
    </div>
  </section>
</template>

<style scoped>
.harness-summary__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--rt-space-5);
}

.harness-summary__heading {
  min-width: 0;
}

.harness-summary__title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--rt-space-3);
}

.harness-summary__title-row h2 {
  margin: 0;
  color: var(--rt-text-primary);
  font-size: var(--rt-font-size-lg);
}

.harness-summary__mode {
  padding: var(--rt-space-1) var(--rt-space-2);
  border: 1px solid var(--rt-border-default);
  border-radius: var(--rt-radius-round);
  background: var(--rt-bg-subtle);
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
}

.harness-summary__latest {
  max-width: 900px;
  margin: var(--rt-space-2) 0 0;
  overflow: hidden;
  color: var(--rt-text-secondary);
  font-size: var(--rt-font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.harness-summary__metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--rt-space-2);
  margin-top: var(--rt-space-5);
}

.harness-summary__metric {
  display: grid;
  gap: var(--rt-space-1);
  padding: var(--rt-space-3) var(--rt-space-4);
  border: 1px solid var(--rt-border-subtle);
  border-radius: var(--rt-radius-md);
  background: var(--rt-bg-subtle);
}

.harness-summary__metric span {
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
}

.harness-summary__metric strong {
  color: var(--rt-text-primary);
  font-size: var(--rt-font-size-lg);
  font-variant-numeric: tabular-nums;
}

.harness-summary__connection {
  margin-top: var(--rt-space-3);
  padding: var(--rt-space-2) var(--rt-space-3);
  border-radius: var(--rt-radius-sm);
  background: var(--rt-bg-subtle);
  color: var(--rt-text-secondary);
  font-size: var(--rt-font-size-xs);
}

.harness-summary__connection.is-reconnecting,
.harness-summary__connection.is-disconnected:not(.is-history) {
  color: var(--rt-color-warning-600);
}

.harness-summary__connection.is-history {
  color: var(--rt-text-tertiary);
}

@media (max-width: 720px) {
  .harness-summary__header {
    flex-direction: column;
  }

  .harness-summary__latest {
    white-space: normal;
  }

  .harness-summary__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
