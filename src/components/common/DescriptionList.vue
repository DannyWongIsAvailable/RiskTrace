<script setup lang="ts">
import type { DescriptionItem } from '@/types/ui'

const props = withDefaults(
  defineProps<{
    items: DescriptionItem[]
    columns?: 1 | 2 | 3
    bordered?: boolean
    direction?: 'horizontal' | 'vertical'
    size?: 'small' | 'default' | 'large'
  }>(),
  {
    columns: 2,
    bordered: true,
    direction: 'horizontal',
    size: 'default',
  },
)

function normalizedSpan(item: DescriptionItem): number {
  return Math.min(item.span ?? 1, props.columns)
}
</script>

<template>
  <div class="description-list">
    <el-descriptions
      :column="columns"
      :border="bordered"
      :direction="direction"
      :size="size"
    >
      <el-descriptions-item
        v-for="item in items"
        :key="item.key"
        :label="item.label"
        :span="normalizedSpan(item)"
      >
        <slot :name="item.key" :item="item">
          {{ item.value ?? '—' }}
        </slot>
      </el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<style scoped>
.description-list {
  width: 100%;
  overflow-x: auto;
}

.description-list :deep(.el-descriptions__label) {
  font-weight: 600;
}

.description-list :deep(.el-descriptions__content) {
  overflow-wrap: anywhere;
}
</style>
