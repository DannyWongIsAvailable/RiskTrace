<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    description?: string
    compact?: boolean
  }>(),
  {
    description: undefined,
    compact: false,
  },
)
</script>

<template>
  <div class="section-header" :class="{ 'section-header--compact': compact }">
    <div>
      <h2 class="section-header__title">{{ title }}</h2>
      <p v-if="description" class="section-header__description">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="section-header__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.section-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--rt-space-4);
  margin-bottom: var(--rt-space-4);
}

.section-header--compact {
  margin-bottom: var(--rt-space-3);
}

.section-header__title {
  color: var(--rt-text-primary);
  font-size: var(--rt-font-size-lg);
  font-weight: 700;
}

.section-header__description {
  margin-top: var(--rt-space-2);
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-sm);
}

.section-header__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--rt-space-2);
}

@media (max-width: 640px) {
  .section-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
