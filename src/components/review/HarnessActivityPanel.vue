<script setup lang="ts">
import { computed, ref } from 'vue'

import HarnessActivityInspector from './HarnessActivityInspector.vue'
import HarnessActivityList from './HarnessActivityList.vue'
import HarnessRunSidebar from './HarnessRunSidebar.vue'
import HarnessRunSummary from './HarnessRunSummary.vue'
import type {
  ReviewActivity,
  ReviewActivityProjection,
  ReviewConnectionState,
  ReviewHarnessEvent,
} from '@/types/review-activity'

const props = defineProps<{
  status: 'reviewing' | 'completed' | 'failed'
  startedAt?: string | null
  finishedAt?: string | null
  projection: ReviewActivityProjection
  events: ReviewHarnessEvent[]
  connectionState: ReviewConnectionState
  connectionMessage?: string
  reportReady: boolean
  reviewRunId?: string | null
  runId?: string | null
  sessionId?: string | null
}>()
const emit = defineEmits<{ viewReport: [] }>()

const activeView = ref<'trajectory' | 'events'>('trajectory')
const selectedActivityId = ref<string>()
const selectedActivity = computed<ReviewActivity | undefined>(() =>
  props.projection.activities.find((activity) => activity.id === selectedActivityId.value),
)
const isHistorical = computed(() => props.status !== 'reviewing')

function selectActivity(activity: ReviewActivity): void {
  selectedActivityId.value = activity.id
}
</script>

<template>
  <BaseCard class="harness-panel">
    <HarnessRunSummary
      :status="props.status"
      :started-at="props.startedAt"
      :finished-at="props.finishedAt"
      :projection="props.projection"
      :event-count="props.events.length"
      :connection-state="props.connectionState"
      :connection-message="props.connectionMessage"
      :report-ready="props.reportReady"
      @view-report="emit('viewReport')"
    />

    <div class="harness-panel__toolbar" role="tablist" aria-label="Agent 工作台视图">
      <button
        type="button"
        role="tab"
        class="harness-panel__tab"
        :class="{ 'is-active': activeView === 'trajectory' }"
        :aria-selected="activeView === 'trajectory'"
        @click="activeView = 'trajectory'"
      >
        执行轨迹
      </button>
      <button
        type="button"
        role="tab"
        class="harness-panel__tab"
        :class="{ 'is-active': activeView === 'events' }"
        :aria-selected="activeView === 'events'"
        @click="activeView = 'events'"
      >
        原始事件
      </button>
    </div>

    <div v-if="activeView === 'trajectory'" class="harness-panel__workspace">
      <section class="harness-panel__trajectory" aria-label="Harness 执行轨迹">
        <div class="harness-panel__section-head">
          <div>
            <strong>{{ isHistorical ? '历史执行轨迹' : '实时执行轨迹' }}</strong>
            <span>
              {{ isHistorical ? '从 Turn 1 开始回放本次审查。' : '新事件到达时自动跟随最新活动。' }}
            </span>
          </div>
        </div>
        <HarnessActivityList
          :turns="props.projection.turns"
          :activities="props.projection.activities"
          :follow-latest="!isHistorical"
          :selected-activity-id="selectedActivityId"
          @select="selectActivity"
        />
      </section>

      <HarnessRunSidebar
        :status="props.status"
        :started-at="props.startedAt"
        :finished-at="props.finishedAt"
        :todos="props.projection.todos"
        :activity="selectedActivity"
        :events="props.events"
        :review-run-id="props.reviewRunId"
        :run-id="props.runId"
        :session-id="props.sessionId"
        @clear-selection="selectedActivityId = undefined"
      />
    </div>

    <section v-else class="harness-panel__events" aria-label="Harness 原始事件">
      <div class="harness-panel__section-head">
        <div>
          <strong>原始事件日志</strong>
          <span>按 Session Event 序号查看浏览器安全裁剪后的事件数据。</span>
        </div>
      </div>
      <HarnessActivityInspector :events="props.events" />
    </section>

    <div v-if="props.status === 'reviewing' && props.events.length === 0" class="harness-panel__idle">
      Harness 正在运行，暂未产生新的可展示活动
    </div>
    <div v-else-if="props.status === 'completed'" class="harness-panel__terminal is-success">
      本次审查已完成。执行轨迹作为历史记录保留，可从 Turn 1 回放并检查原始事件。
    </div>
    <div v-else-if="props.status === 'failed'" class="harness-panel__terminal is-danger">
      本次审查执行失败。失败前的 Harness 轨迹仍已保留，可继续定位最后活动与原始事件。
    </div>
  </BaseCard>
</template>

<style scoped>
.harness-panel__toolbar {
  display: flex;
  gap: var(--rt-space-5);
  margin-top: var(--rt-space-5);
  border-bottom: 1px solid var(--rt-border-default);
}

.harness-panel__tab {
  margin-bottom: -1px;
  padding: var(--rt-space-3) var(--rt-space-1);
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--rt-text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: var(--rt-font-size-sm);
  font-weight: 700;
}

.harness-panel__tab.is-active {
  border-bottom-color: var(--rt-color-primary-600);
  color: var(--rt-color-primary-700);
}

.harness-panel__tab:focus-visible {
  outline: 2px solid var(--rt-color-primary-500);
  outline-offset: 2px;
}

.harness-panel__workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(300px, 0.85fr);
  min-height: 520px;
  margin-top: var(--rt-space-4);
  border: 1px solid var(--rt-border-default);
  border-radius: var(--rt-radius-lg);
  overflow: hidden;
}

.harness-panel__trajectory,
.harness-panel__events {
  min-width: 0;
}

.harness-panel__trajectory {
  padding: var(--rt-space-4) var(--rt-space-5);
  background: var(--rt-bg-panel);
}

.harness-panel__section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--rt-space-4);
  padding-bottom: var(--rt-space-3);
  border-bottom: 1px solid var(--rt-border-subtle);
}

.harness-panel__section-head > div {
  display: grid;
  gap: var(--rt-space-1);
}

.harness-panel__section-head strong {
  color: var(--rt-text-primary);
  font-size: var(--rt-font-size-sm);
}

.harness-panel__section-head span {
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
}

.harness-panel__events {
  margin-top: var(--rt-space-4);
  padding: var(--rt-space-4) var(--rt-space-5);
  border: 1px solid var(--rt-border-default);
  border-radius: var(--rt-radius-lg);
}

.harness-panel__events :deep(.harness-inspector) {
  margin-top: var(--rt-space-4);
}

.harness-panel__idle,
.harness-panel__terminal {
  margin-top: var(--rt-space-4);
  padding: var(--rt-space-3);
  border-top: 1px solid var(--rt-border-subtle);
  color: var(--rt-text-secondary);
  font-size: var(--rt-font-size-sm);
}

.harness-panel__terminal.is-success {
  color: var(--rt-color-success-600);
}

.harness-panel__terminal.is-danger {
  color: var(--rt-color-danger-600);
}

@media (max-width: 980px) {
  .harness-panel__workspace {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .harness-panel__trajectory,
  .harness-panel__events {
    padding: var(--rt-space-3);
  }
}
</style>
