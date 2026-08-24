<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const props = defineProps<{
  projectId: string
  reportReady: boolean
}>()

const route = useRoute()
const router = useRouter()

const activeTab = computed<'review' | 'report'>(() =>
  route.name === 'project-report' ? 'report' : 'review',
)
const canOpenReport = computed(() => props.reportReady || activeTab.value === 'report')

function openReview(): void {
  if (activeTab.value === 'review') return
  void router.push({ name: 'project-review', params: { projectId: props.projectId } })
}

function openReport(): void {
  if (!canOpenReport.value || activeTab.value === 'report') return
  void router.push({ name: 'project-report', params: { projectId: props.projectId } })
}
</script>

<template>
  <nav class="project-detail-tabs" aria-label="项目详情视图">
    <div class="project-detail-tabs__label">项目详情</div>
    <div class="project-detail-tabs__items" role="tablist">
      <button
        type="button"
        role="tab"
        class="project-detail-tabs__item"
        :class="{ 'is-active': activeTab === 'review' }"
        :aria-selected="activeTab === 'review'"
        @click="openReview"
      >
        执行过程
        <span>Harness 工作轨迹</span>
      </button>
      <button
        type="button"
        role="tab"
        class="project-detail-tabs__item"
        :class="{ 'is-active': activeTab === 'report', 'is-disabled': !canOpenReport }"
        :aria-selected="activeTab === 'report'"
        :aria-disabled="!canOpenReport"
        :disabled="!canOpenReport"
        @click="openReport"
      >
        审查报告
        <span>{{ canOpenReport ? '风险结论与建议' : '审查完成后可查看' }}</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.project-detail-tabs {
  display: flex;
  min-width: 0;
  align-items: stretch;
  gap: var(--rt-space-4);
  padding: var(--rt-space-2) var(--rt-space-3);
  border: 1px solid var(--rt-border-default);
  border-radius: var(--rt-radius-lg);
  background: var(--rt-bg-panel);
  box-shadow: var(--rt-shadow-xs);
}

.project-detail-tabs__label {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  padding: 0 var(--rt-space-3);
  border-right: 1px solid var(--rt-border-subtle);
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
  font-weight: 700;
}

.project-detail-tabs__items {
  display: flex;
  min-width: 0;
  gap: var(--rt-space-2);
}

.project-detail-tabs__item {
  display: grid;
  min-width: 170px;
  gap: 2px;
  padding: var(--rt-space-2) var(--rt-space-4);
  border: 1px solid transparent;
  border-radius: var(--rt-radius-md);
  background: transparent;
  color: var(--rt-text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: var(--rt-font-size-sm);
  font-weight: 700;
  text-align: left;
  transition:
    background-color var(--rt-duration-fast) var(--rt-ease-standard),
    border-color var(--rt-duration-fast) var(--rt-ease-standard),
    color var(--rt-duration-fast) var(--rt-ease-standard);
}

.project-detail-tabs__item span {
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
  font-weight: 400;
}

.project-detail-tabs__item:hover:not(:disabled) {
  border-color: var(--rt-color-primary-200);
  background: var(--rt-bg-selected);
  color: var(--rt-color-primary-800);
}

.project-detail-tabs__item.is-active {
  border-color: var(--rt-color-primary-200);
  background: var(--rt-bg-selected);
  color: var(--rt-color-primary-800);
}

.project-detail-tabs__item.is-active span {
  color: var(--rt-color-primary-700);
}

.project-detail-tabs__item.is-disabled {
  color: var(--rt-text-disabled);
  cursor: not-allowed;
}

.project-detail-tabs__item.is-disabled span {
  color: var(--rt-text-disabled);
}

.project-detail-tabs__item:focus-visible {
  outline: 2px solid var(--rt-color-primary-500);
  outline-offset: 2px;
}

@media (max-width: 720px) {
  .project-detail-tabs {
    flex-direction: column;
    gap: var(--rt-space-2);
  }

  .project-detail-tabs__label {
    padding: var(--rt-space-1) var(--rt-space-2);
    border-right: 0;
    border-bottom: 1px solid var(--rt-border-subtle);
  }

  .project-detail-tabs__items {
    width: 100%;
  }

  .project-detail-tabs__item {
    min-width: 0;
    flex: 1 1 0;
  }
}
</style>
