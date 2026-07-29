<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    description?: string
  }>(),
  {
    title: undefined,
    description: undefined,
  },
)
</script>

<template>
  <BaseCard class="filter-bar" padding="sm">
    <div class="filter-bar__layout">
      <div v-if="title || description" class="filter-bar__heading">
        <strong v-if="title" class="filter-bar__title">{{ title }}</strong>
        <span v-if="description" class="filter-bar__description">{{ description }}</span>
      </div>

      <div class="filter-bar__controls">
        <slot />
      </div>

      <div v-if="$slots.actions" class="filter-bar__actions">
        <slot name="actions" />
      </div>
    </div>
  </BaseCard>
</template>

<style scoped>
.filter-bar__layout {
  display: flex;
  align-items: flex-end;
  gap: var(--rt-space-4);
}

.filter-bar__heading {
  display: flex;
  flex: 0 0 180px;
  flex-direction: column;
  gap: var(--rt-space-1);
}

.filter-bar__title {
  color: var(--el-text-color-primary);
  font-size: var(--rt-font-size-sm);
}

.filter-bar__description {
  color: var(--el-text-color-secondary);
  font-size: var(--rt-font-size-xs);
}

.filter-bar__controls {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--rt-space-3);
}

.filter-bar__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--rt-space-2);
}

@media (max-width: 900px) {
  .filter-bar__layout {
    align-items: stretch;
    flex-direction: column;
  }

  .filter-bar__heading {
    flex-basis: auto;
  }
}
</style>
