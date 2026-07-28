<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    rows?: number
    animated?: boolean
  }>(),
  {
    title: '正在加载数据',
    rows: 4,
    animated: true,
  },
)
</script>

<template>
  <div class="loading-state" role="status" aria-live="polite" aria-busy="true">
    <span class="loading-state__label">{{ title }}</span>
    <el-skeleton :rows="rows" :animated="animated" />
  </div>
</template>

<style scoped>
.loading-state {
  padding: var(--rt-space-6);
}

.loading-state__label {
  display: block;
  margin-bottom: var(--rt-space-4);
  color: var(--el-text-color-secondary);
  font-size: var(--rt-font-size-sm);
}
</style>
