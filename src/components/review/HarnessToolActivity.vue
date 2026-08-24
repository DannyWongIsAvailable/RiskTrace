<script setup lang="ts">
import { AppIcons } from '@/icons'
import type { ReviewActivity } from '@/types/review-activity'

const props = withDefaults(defineProps<{ activity: ReviewActivity; selected?: boolean }>(), { selected: false })
const emit = defineEmits<{ select: [] }>()

function formatDuration(ms?: number): string | null {
  if (ms === undefined) return null
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
}
</script>

<template>
  <button type="button" class="harness-tool" :class="{ 'is-selected': props.selected }" @click="emit('select')">
    <el-icon class="harness-tool__icon" :class="{ 'is-running': props.activity.status === 'running' }">
      <component :is="props.activity.status === 'failed' ? AppIcons.status.danger : props.activity.status === 'completed' ? AppIcons.status.success : AppIcons.status.loading" />
    </el-icon>
    <span class="harness-tool__body">
      <span class="harness-tool__head">
        <strong>{{ props.activity.title }}</strong>
        <span class="harness-tool__state">{{ props.activity.status === 'running' ? '运行中' : props.activity.status === 'completed' ? '已完成' : props.activity.status === 'failed' ? '执行失败' : '已中断' }}<template v-if="formatDuration(props.activity.durationMs)"> · {{ formatDuration(props.activity.durationMs) }}</template></span>
      </span>
      <span v-if="props.activity.summary" class="harness-tool__summary">{{ props.activity.summary }}</span>
      <span v-if="props.activity.tool?.isSubtool" class="harness-tool__meta">Code Mode 子工具 · {{ props.activity.tool.name }}</span>
    </span>
  </button>
</template>

<style scoped>
.harness-tool { width: 100%; display: grid; grid-template-columns: 22px minmax(0,1fr); gap: var(--rt-space-3); padding: var(--rt-space-3) 0; border: 0; border-bottom: 1px solid var(--rt-border-subtle); background: transparent; color: inherit; text-align: left; cursor: pointer; }
.harness-tool.is-selected { background: var(--rt-bg-selected); }
.harness-tool:focus-visible { outline: 2px solid var(--rt-color-primary-500); outline-offset: 2px; }
.harness-tool__icon { margin-top: 3px; color: var(--rt-text-tertiary); }
.harness-tool__icon.is-running { color: var(--rt-color-primary-600); animation: harness-tool-spin 1.2s linear infinite; }
.harness-tool__body { min-width: 0; }
.harness-tool__head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--rt-space-3); }
.harness-tool__head strong { color: var(--rt-text-primary); font-size: var(--rt-font-size-sm); }
.harness-tool__state { flex: 0 0 auto; color: var(--rt-text-tertiary); font-size: var(--rt-font-size-xs); }
.harness-tool__summary, .harness-tool__meta { display: block; margin-top: var(--rt-space-1); color: var(--rt-text-secondary); font-size: var(--rt-font-size-xs); overflow-wrap: anywhere; }
.harness-tool__meta { color: var(--rt-text-tertiary); }
@keyframes harness-tool-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .harness-tool__icon.is-running { animation: none; } }
@media (max-width: 600px) { .harness-tool__head { align-items: flex-start; flex-direction: column; gap: 2px; } }
</style>
