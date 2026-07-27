<script setup lang="ts">
import type { StatusTone } from '@/types/ui'

withDefaults(
  defineProps<{
    title: string
    description?: string
    tone?: StatusTone
  }>(),
  {
    description: undefined,
    tone: 'neutral',
  },
)
</script>

<template>
  <div class="inline-notice" :class="`inline-notice--${tone}`" role="status">
    <span class="inline-notice__marker" aria-hidden="true" />
    <div class="inline-notice__content">
      <strong class="inline-notice__title">{{ title }}</strong>
      <p v-if="description" class="inline-notice__description">{{ description }}</p>
      <div v-if="$slots.default" class="inline-notice__body">
        <slot />
      </div>
    </div>
    <div v-if="$slots.actions" class="inline-notice__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.inline-notice {
  display: flex;
  align-items: flex-start;
  gap: var(--rt-space-3);
  padding: var(--rt-space-4);
  border: 1px solid var(--rt-border-default);
  border-left-width: 4px;
  border-radius: var(--rt-radius-md);
  background: var(--rt-bg-subtle);
  color: var(--rt-text-secondary);
}

.inline-notice__marker {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  margin-top: 6px;
  border-radius: 50%;
  background: currentColor;
}

.inline-notice__content {
  min-width: 0;
  flex: 1 1 auto;
}

.inline-notice__title {
  display: block;
  color: var(--rt-text-primary);
  font-size: var(--rt-font-size-sm);
}

.inline-notice__description,
.inline-notice__body {
  margin-top: var(--rt-space-1);
  font-size: var(--rt-font-size-sm);
}

.inline-notice__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--rt-space-2);
}

.inline-notice--primary {
  border-color: var(--rt-color-primary-200);
  border-left-color: var(--rt-color-primary-600);
  background: var(--rt-color-primary-50);
  color: var(--rt-color-primary-700);
}

.inline-notice--success {
  border-color: var(--rt-color-success-200);
  border-left-color: var(--rt-color-success-600);
  background: var(--rt-color-success-50);
  color: var(--rt-color-success-600);
}

.inline-notice--warning {
  border-color: var(--rt-color-warning-200);
  border-left-color: var(--rt-color-warning-600);
  background: var(--rt-color-warning-50);
  color: var(--rt-color-warning-600);
}

.inline-notice--danger {
  border-color: var(--rt-color-danger-200);
  border-left-color: var(--rt-color-danger-600);
  background: var(--rt-color-danger-50);
  color: var(--rt-color-danger-600);
}

@media (max-width: 640px) {
  .inline-notice {
    flex-wrap: wrap;
  }

  .inline-notice__actions {
    width: 100%;
    padding-left: calc(8px + var(--rt-space-3));
  }
}
</style>
