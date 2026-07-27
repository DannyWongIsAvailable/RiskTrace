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
  <section class="filter-bar" aria-label="筛选条件">
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
  </section>
</template>

<style scoped>
.filter-bar {
  display: flex;
  align-items: flex-end;
  gap: var(--rt-space-4);
  padding: var(--rt-space-4);
  border: 1px solid var(--rt-border-subtle);
  border-radius: var(--rt-radius-lg);
  background: var(--rt-bg-panel);
  box-shadow: var(--rt-shadow-xs);
}

.filter-bar__heading {
  flex: 0 0 180px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.filter-bar__title {
  color: var(--rt-text-primary);
  font-size: var(--rt-font-size-sm);
}

.filter-bar__description {
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
}

.filter-bar__controls {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--rt-space-3);
  min-width: 0;
}

.filter-bar__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--rt-space-2);
}

@media (max-width: 900px) {
  .filter-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .filter-bar__heading {
    flex-basis: auto;
  }
}
</style>
