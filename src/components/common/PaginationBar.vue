<script setup lang="ts">
const emit = defineEmits<{
  'update:page': [value: number]
  'update:pageSize': [value: number]
}>()

withDefaults(
  defineProps<{
    page: number
    pageSize: number
    total: number
    pageSizes?: number[]
    disabled?: boolean
  }>(),
  {
    pageSizes: () => [10, 20, 50, 100],
    disabled: false,
  },
)
</script>

<template>
  <div class="pagination-bar">
    <span class="pagination-bar__summary">共 {{ total }} 条记录</span>
    <el-pagination
      :current-page="page"
      :page-size="pageSize"
      :page-sizes="pageSizes"
      :total="total"
      :disabled="disabled"
      layout="sizes, prev, pager, next, jumper"
      background
      @update:current-page="emit('update:page', $event)"
      @update:page-size="emit('update:pageSize', $event)"
    />
  </div>
</template>

<style scoped>
.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rt-space-4);
  width: 100%;
}

.pagination-bar__summary {
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
}

@media (max-width: 760px) {
  .pagination-bar {
    align-items: flex-start;
    flex-direction: column;
    overflow-x: auto;
  }
}
</style>
