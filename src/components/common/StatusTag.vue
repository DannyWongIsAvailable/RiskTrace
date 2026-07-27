<script setup lang="ts">
import type { StatusTone } from '@/types/ui'

withDefaults(
  defineProps<{
    label: string
    tone?: StatusTone
    dot?: boolean
  }>(),
  {
    tone: 'neutral',
    dot: true,
  },
)
</script>

<template>
  <span class="status-tag" :class="`status-tag--${tone}`">
    <span v-if="dot" class="status-tag__dot" aria-hidden="true" />
    <span>{{ label }}</span>
  </span>
</template>

<style scoped>
.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 26px;
  padding: 4px 9px;
  border: 1px solid transparent;
  border-radius: var(--rt-radius-round);
  font-size: var(--rt-font-size-xs);
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.status-tag__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status-tag--neutral {
  border-color: var(--rt-border-default);
  background: var(--rt-bg-subtle);
  color: var(--rt-color-info-600);
}

.status-tag--primary {
  border-color: var(--rt-color-primary-200);
  background: var(--rt-color-primary-50);
  color: var(--rt-color-primary-700);
}

.status-tag--success {
  border-color: var(--rt-color-success-200);
  background: var(--rt-color-success-50);
  color: var(--rt-color-success-600);
}

.status-tag--warning {
  border-color: var(--rt-color-warning-200);
  background: var(--rt-color-warning-50);
  color: var(--rt-color-warning-600);
}

.status-tag--danger {
  border-color: var(--rt-color-danger-200);
  background: var(--rt-color-danger-50);
  color: var(--rt-color-danger-600);
}
</style>
