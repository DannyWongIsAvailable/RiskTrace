<script setup lang="ts">
const emit = defineEmits<{
  retry: []
}>()

withDefaults(
  defineProps<{
    title: string
    description?: string
    loading?: boolean
    loadingRows?: number
    empty?: boolean
    emptyTitle?: string
    emptyDescription?: string
    error?: boolean
    errorTitle?: string
    errorDescription?: string
    retryLabel?: string
  }>(),
  {
    description: undefined,
    loading: false,
    loadingRows: 5,
    empty: false,
    emptyTitle: '暂无数据',
    emptyDescription: '当前筛选条件下没有可展示的记录。',
    error: false,
    errorTitle: '数据加载失败',
    errorDescription: '请检查网络连接后重试。若问题持续存在，请联系系统管理员。',
    retryLabel: '重新加载',
  },
)
</script>

<template>
  <BaseCard :title="title" :description="description" padding="none">
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>

    <LoadingState v-if="loading" :rows="loadingRows" />
    <ErrorState
      v-else-if="error"
      compact
      :title="errorTitle"
      :description="errorDescription"
      :retry-label="retryLabel"
      @retry="emit('retry')"
    />
    <EmptyState
      v-else-if="empty"
      :title="emptyTitle"
      :description="emptyDescription"
      compact
    >
      <template v-if="$slots.emptyAction" #action>
        <slot name="emptyAction" />
      </template>
    </EmptyState>
    <div v-else class="base-table-card__content">
      <slot />
    </div>

    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </BaseCard>
</template>

<style scoped>
.base-table-card__content {
  width: 100%;
  overflow-x: auto;
}

.base-table-card__content :deep(.el-table) {
  border-radius: 0;
}
</style>
