<script setup lang="ts">
import type { DescriptionItem } from '@/types/ui'

withDefaults(
  defineProps<{
    items: DescriptionItem[]
    columns?: 1 | 2 | 3
    bordered?: boolean
  }>(),
  {
    columns: 2,
    bordered: true,
  },
)
</script>

<template>
  <dl
    class="description-list"
    :class="[
      `description-list--columns-${columns}`,
      { 'description-list--bordered': bordered },
    ]"
  >
    <div
      v-for="item in items"
      :key="item.key"
      class="description-list__item"
      :class="`description-list__item--span-${item.span ?? 1}`"
    >
      <dt class="description-list__label">{{ item.label }}</dt>
      <dd class="description-list__value">
        <slot :name="item.key" :item="item">
          {{ item.value ?? '—' }}
        </slot>
      </dd>
    </div>
  </dl>
</template>

<style scoped>
.description-list {
  display: grid;
  gap: 0;
  margin: 0;
  overflow: hidden;
  border-radius: var(--rt-radius-md);
}

.description-list--columns-1 {
  grid-template-columns: 1fr;
}

.description-list--columns-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.description-list--columns-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.description-list--bordered {
  border-top: 1px solid var(--rt-border-subtle);
  border-left: 1px solid var(--rt-border-subtle);
}

.description-list__item {
  min-width: 0;
  padding: var(--rt-space-4);
}

.description-list--bordered .description-list__item {
  border-right: 1px solid var(--rt-border-subtle);
  border-bottom: 1px solid var(--rt-border-subtle);
}

.description-list__item--span-2 {
  grid-column: span 2;
}

.description-list__item--span-3 {
  grid-column: span 3;
}

.description-list__label {
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
  font-weight: 700;
}

.description-list__value {
  min-width: 0;
  margin: var(--rt-space-2) 0 0;
  overflow-wrap: anywhere;
  color: var(--rt-text-primary);
  font-size: var(--rt-font-size-sm);
  font-weight: 650;
}

@media (max-width: 720px) {
  .description-list--columns-2,
  .description-list--columns-3 {
    grid-template-columns: 1fr;
  }

  .description-list__item--span-2,
  .description-list__item--span-3 {
    grid-column: span 1;
  }
}
</style>
