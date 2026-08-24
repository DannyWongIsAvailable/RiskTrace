<script setup lang="ts">
import { AppIcons } from '@/icons'
import type { ReviewActivity } from '@/types/review-activity'

withDefaults(defineProps<{ activity: ReviewActivity; selected?: boolean }>(), { selected: false })
const emit = defineEmits<{ select: [] }>()
</script>

<template>
  <button type="button" class="harness-activity harness-assistant" :class="{ 'is-selected': selected }" @click="emit('select')">
    <el-icon class="harness-activity__icon" :class="{ 'is-running': activity.status === 'running' }">
      <component :is="activity.status === 'running' ? AppIcons.status.loading : AppIcons.navigation.foundation" />
    </el-icon>
    <span class="harness-activity__body">
      <span class="harness-activity__head"><strong>{{ activity.title }}</strong><StatusTag :label="activity.status === 'running' ? '运行中' : activity.status === 'completed' ? '已完成' : activity.status === 'failed' ? '失败' : '已中断'" :tone="activity.status === 'completed' ? 'success' : activity.status === 'failed' ? 'danger' : 'warning'" /></span>
      <span v-if="activity.summary" class="harness-activity__summary">{{ activity.summary }}</span>
    </span>
  </button>
</template>

<style scoped>
.harness-activity { width: 100%; display: grid; grid-template-columns: 22px minmax(0,1fr); gap: var(--rt-space-3); padding: var(--rt-space-3) 0; border: 0; border-bottom: 1px solid var(--rt-border-subtle); background: transparent; text-align: left; cursor: pointer; color: inherit; }
.harness-activity.is-selected { background: var(--rt-bg-selected); }
.harness-activity:focus-visible { outline: 2px solid var(--rt-color-primary-500); outline-offset: 2px; }
.harness-activity__icon { margin-top: 3px; color: var(--rt-color-primary-600); }
.harness-activity__icon.is-running { animation: harness-spin 1.2s linear infinite; }
.harness-activity__body { min-width: 0; }
.harness-activity__head { display: flex; align-items: center; justify-content: space-between; gap: var(--rt-space-3); }
.harness-activity__head strong { color: var(--rt-text-primary); font-size: var(--rt-font-size-sm); }
.harness-activity__summary { display: -webkit-box; margin-top: var(--rt-space-2); color: var(--rt-text-secondary); font-size: var(--rt-font-size-sm); line-height: 1.6; overflow: hidden; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
@keyframes harness-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .harness-activity__icon.is-running { animation: none; } }
</style>
