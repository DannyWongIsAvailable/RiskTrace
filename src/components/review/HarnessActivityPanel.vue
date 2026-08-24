<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import HarnessActivityInspector from './HarnessActivityInspector.vue'
import HarnessActivityList from './HarnessActivityList.vue'
import HarnessTodoPlan from './HarnessTodoPlan.vue'
import type {
  ReviewActivity,
  ReviewActivityProjection,
  ReviewConnectionState,
  ReviewHarnessEvent,
} from '@/types/review-activity'
import type { StatusTone } from '@/types/ui'

const props = defineProps<{
  status: 'reviewing' | 'completed' | 'failed'
  startedAt?: string | null
  finishedAt?: string | null
  projection: ReviewActivityProjection
  events: ReviewHarnessEvent[]
  connectionState: ReviewConnectionState
  connectionMessage?: string
  reportReady: boolean
}>()
const emit = defineEmits<{ viewReport: [] }>()

const activeTab = ref<'activity' | 'technical'>('activity')
const selectedActivity = ref<ReviewActivity>()
const now = ref(Date.now())
let clock: number | undefined

const statusLabel = computed(() =>
  props.status === 'reviewing' ? '运行中' : props.status === 'completed' ? '已完成' : '失败',
)
const statusTone = computed<StatusTone>(() =>
  props.status === 'completed' ? 'success' : props.status === 'failed' ? 'danger' : 'primary',
)
const elapsed = computed(() => {
  if (!props.startedAt) return '—'
  const start = Date.parse(props.startedAt)
  const finish = props.finishedAt ? Date.parse(props.finishedAt) : now.value
  if (!Number.isFinite(start) || !Number.isFinite(finish)) return '—'
  const seconds = Math.max(0, Math.floor((finish - start) / 1000))
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const parts = [hours, minutes % 60, seconds % 60].map((value) => String(value).padStart(2, '0'))
  return hours > 0 ? parts.join(':') : parts.slice(1).join(':')
})
const connectionLabel = computed(() => {
  switch (props.connectionState) {
    case 'connected': return '轨迹已连接'
    case 'connecting': return '正在连接轨迹'
    case 'reconnecting': return '轨迹暂时断开，正在重连'
    case 'disconnected': return '轨迹不可用'
  }
})

function selectActivity(activity: ReviewActivity): void {
  selectedActivity.value = activity
  activeTab.value = 'technical'
}

onMounted(() => {
  clock = window.setInterval(() => { now.value = Date.now() }, 1000)
})
onBeforeUnmount(() => {
  if (clock !== undefined) window.clearInterval(clock)
})
</script>

<template>
  <BaseCard class="harness-panel">
    <div class="harness-panel__header">
      <div>
        <div class="harness-panel__title-row">
          <h2>AI 合规审查</h2>
          <StatusTag :label="statusLabel" :tone="statusTone" />
        </div>
        <p class="harness-panel__metrics">
          {{ props.status === 'completed' ? '总用时' : '已运行' }} {{ elapsed }}
          · {{ props.projection.stats.turnCount }} Turn
          · {{ props.projection.stats.stepCount }} Step
          · {{ props.projection.stats.toolCallCount }} Tool
        </p>
        <p class="harness-panel__latest">
          最近活动：{{ props.projection.latestActivity?.title ?? '等待 Harness 产生可展示事件' }}
          <template v-if="props.projection.latestActivity?.summary"> · {{ props.projection.latestActivity.summary }}</template>
        </p>
      </div>
      <el-button v-if="props.reportReady" type="primary" @click="emit('viewReport')">查看审查报告</el-button>
    </div>

    <div class="harness-panel__connection" :class="`is-${props.connectionState}`">
      {{ connectionLabel }}<template v-if="props.connectionMessage"> · {{ props.connectionMessage }}</template>
    </div>

    <HarnessTodoPlan :todos="props.projection.todos" />

    <div class="harness-panel__toolbar" role="tablist" aria-label="审查运行视图">
      <el-button :type="activeTab === 'activity' ? 'primary' : undefined" plain @click="activeTab = 'activity'">工作过程</el-button>
      <el-button :type="activeTab === 'technical' ? 'primary' : undefined" plain @click="activeTab = 'technical'">技术详情</el-button>
    </div>

    <HarnessActivityList
      v-if="activeTab === 'activity'"
      :turns="props.projection.turns"
      :activities="props.projection.activities"
      @select="selectActivity"
    />
    <HarnessActivityInspector
      v-else
      :activity="selectedActivity"
      :events="props.events"
    />

    <div v-if="props.status === 'reviewing' && props.events.length === 0" class="harness-panel__idle">
      Harness 正在运行，暂未产生新的可展示活动
    </div>
    <div v-else-if="props.status === 'completed'" class="harness-panel__terminal is-success">
      审查已完成，运行轨迹已保留，可继续查看技术详情。
    </div>
    <div v-else-if="props.status === 'failed'" class="harness-panel__terminal is-danger">
      审查执行失败，失败前的 Harness 运行轨迹已保留。
    </div>
  </BaseCard>
</template>

<style scoped>
.harness-panel__header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--rt-space-5); }
.harness-panel__title-row { display: flex; align-items: center; gap: var(--rt-space-3); }
.harness-panel__title-row h2 { margin: 0; color: var(--rt-text-primary); font-size: var(--rt-font-size-lg); }
.harness-panel__metrics, .harness-panel__latest { margin: var(--rt-space-2) 0 0; color: var(--rt-text-secondary); font-size: var(--rt-font-size-sm); }
.harness-panel__latest { max-width: 760px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.harness-panel__connection { margin-top: var(--rt-space-4); padding: var(--rt-space-2) var(--rt-space-3); border-radius: var(--rt-radius-sm); background: var(--rt-bg-subtle); color: var(--rt-text-secondary); font-size: var(--rt-font-size-xs); }
.harness-panel__connection.is-reconnecting, .harness-panel__connection.is-disconnected { color: var(--rt-color-warning-600); }
.harness-panel__toolbar { display: flex; gap: var(--rt-space-2); padding: var(--rt-space-4) 0 var(--rt-space-2); }
.harness-panel__idle, .harness-panel__terminal { margin-top: var(--rt-space-4); padding: var(--rt-space-3); border-top: 1px solid var(--rt-border-subtle); color: var(--rt-text-secondary); font-size: var(--rt-font-size-sm); }
.harness-panel__terminal.is-success { color: var(--rt-color-success-600); }
.harness-panel__terminal.is-danger { color: var(--rt-color-danger-600); }
@media (max-width: 720px) {
  .harness-panel__header { flex-direction: column; }
  .harness-panel__latest { white-space: normal; }
  .harness-panel__toolbar { overflow-x: auto; }
}
</style>
