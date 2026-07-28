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
    background?: boolean
    hideOnSinglePage?: boolean
  }>(),
  {
    pageSizes: () => [10, 20, 50, 100],
    disabled: false,
    background: true,
    hideOnSinglePage: false,
  },
)
</script>

<template>
  <div class="pagination-bar">
    <el-pagination
      :current-page="page"
      :page-size="pageSize"
      :page-sizes="pageSizes"
      :total="total"
      :disabled="disabled"
      :background="background"
      :hide-on-single-page="hideOnSinglePage"
      layout="total, sizes, prev, pager, next, jumper"
      @update:current-page="emit('update:page', $event)"
      @update:page-size="emit('update:pageSize', $event)"
    />
  </div>
</template>

<style scoped>
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  width: 100%;
  overflow-x: auto;
}

@media (max-width: 760px) {
  .pagination-bar {
    justify-content: flex-start;
  }
}
</style>
