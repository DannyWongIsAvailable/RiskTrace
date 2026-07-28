<script setup lang="ts">
const emit = defineEmits<{
  retry: []
}>()

withDefaults(
  defineProps<{
    title?: string
    description?: string
    retryLabel?: string
    compact?: boolean
  }>(),
  {
    title: '数据加载失败',
    description: '请检查网络连接后重试。若问题持续存在，请联系系统管理员。',
    retryLabel: '重新加载',
    compact: false,
  },
)
</script>

<template>
  <el-result
    class="error-state"
    :class="{ 'error-state--compact': compact }"
    icon="error"
    :title="title"
    :sub-title="description"
    role="alert"
    aria-live="assertive"
  >
    <template #extra>
      <slot name="action">
        <el-button type="primary" plain @click="emit('retry')">
          {{ retryLabel }}
        </el-button>
      </slot>
    </template>
  </el-result>
</template>

<style scoped>
.error-state {
  min-height: 280px;
  padding: var(--rt-space-8);
}

.error-state--compact {
  min-height: 200px;
  padding: var(--rt-space-6);
}

.error-state :deep(.el-result__icon svg) {
  width: var(--rt-icon-size-state);
  height: var(--rt-icon-size-state);
}

.error-state :deep(.el-result__title) {
  margin-top: var(--rt-space-4);
}

.error-state :deep(.el-result__subtitle) {
  max-width: 520px;
  margin-right: auto;
  margin-left: auto;
}
</style>
