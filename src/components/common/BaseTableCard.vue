<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    description?: string
    loading?: boolean
    empty?: boolean
    emptyTitle?: string
    emptyDescription?: string
  }>(),
  {
    description: undefined,
    loading: false,
    empty: false,
    emptyTitle: '暂无数据',
    emptyDescription: '当前筛选条件下没有可展示的记录。',
  },
)
</script>

<template>
  <BaseCard :title="title" :description="description" padding="none">
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>

    <LoadingState v-if="loading" />
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
