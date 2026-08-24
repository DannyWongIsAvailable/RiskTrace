<script setup lang="ts">
import { AppIcons } from '@/icons'
import type { ReviewActivity } from '@/types/review-activity'

defineProps<{ activity: ReviewActivity }>()
const emit = defineEmits<{ select: [] }>()
</script>

<template>
  <button type="button" class="harness-error" @click="emit('select')">
    <el-icon class="harness-error__icon">
      <component :is="activity.status === 'failed' ? AppIcons.status.danger : AppIcons.status.warning" />
    </el-icon>
    <span class="harness-error__body">
      <span class="harness-error__head">
        <strong>{{ activity.title }}</strong>
        <StatusTag
          :label="activity.status === 'failed' ? '失败' : '已中断'"
          :tone="activity.status === 'failed' ? 'danger' : 'warning'"
        />
      </span>
      <span v-if="activity.summary" class="harness-error__summary">{{ activity.summary }}</span>
    </span>
  </button>
</template>

<style scoped>
.harness-error { width: 100%; display: grid; grid-template-columns: 22px minmax(0,1fr); gap: var(--rt-space-3); padding: var(--rt-space-3) 0; border: 0; border-bottom: 1px solid var(--rt-border-subtle); background: transparent; text-align: left; cursor: pointer; color: inherit; }
.harness-error:focus-visible { outline: 2px solid var(--rt-color-primary-500); outline-offset: 2px; }
.harness-error__icon { margin-top: 3px; color: var(--rt-color-danger-600); }
.harness-error__body { min-width: 0; }
.harness-error__head { display: flex; align-items: center; justify-content: space-between; gap: var(--rt-space-3); }
.harness-error__head strong { color: var(--rt-text-primary); font-size: var(--rt-font-size-sm); }
.harness-error__summary { display: block; margin-top: var(--rt-space-2); color: var(--rt-text-secondary); font-size: var(--rt-font-size-sm); line-height: 1.6; overflow-wrap: anywhere; }
</style>
