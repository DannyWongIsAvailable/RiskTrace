<script setup lang="ts">
import type { StatusTone } from '@/types/ui'

withDefaults(
  defineProps<{
    label: string
    value: string | number
    description?: string
    trend?: string
    trendDirection?: 'up' | 'down' | 'flat'
    tone?: StatusTone
  }>(),
  {
    description: undefined,
    trend: undefined,
    trendDirection: 'flat',
    tone: 'neutral',
  },
)
</script>

<template>
  <BaseCard class="metric-card" padding="md">
    <div class="metric-card__topline">
      <span class="metric-card__label">{{ label }}</span>
      <span class="metric-card__signal" :class="`metric-card__signal--${tone}`" aria-hidden="true" />
    </div>
    <div class="metric-card__value">{{ value }}</div>
    <div class="metric-card__meta">
      <span v-if="description" class="metric-card__description">{{ description }}</span>
      <span
        v-if="trend"
        class="metric-card__trend"
        :class="`metric-card__trend--${trendDirection}`"
      >
        {{ trend }}
      </span>
    </div>
  </BaseCard>
</template>

<style scoped>
.metric-card {
  min-height: 168px;
}

.metric-card__topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rt-space-3);
}

.metric-card__label {
  color: var(--rt-text-secondary);
  font-size: var(--rt-font-size-sm);
  font-weight: 700;
}

.metric-card__signal {
  width: 28px;
  height: 4px;
  border-radius: var(--rt-radius-round);
  background: var(--rt-color-info-500);
}

.metric-card__signal--primary {
  background: var(--rt-color-primary-600);
}

.metric-card__signal--success {
  background: var(--rt-color-success-600);
}

.metric-card__signal--warning {
  background: var(--rt-color-warning-600);
}

.metric-card__signal--danger {
  background: var(--rt-color-danger-600);
}

.metric-card__value {
  margin-top: var(--rt-space-4);
  color: var(--rt-text-primary);
  font-size: clamp(28px, 2.6vw, 38px);
  font-weight: 760;
  letter-spacing: -0.04em;
  line-height: 1.1;
}

.metric-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--rt-space-2);
  margin-top: var(--rt-space-4);
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
}

.metric-card__description {
  flex: 1 1 180px;
}

.metric-card__trend {
  flex: 0 0 auto;
  font-weight: 700;
}

.metric-card__trend--up {
  color: var(--rt-color-danger-600);
}

.metric-card__trend--down {
  color: var(--rt-color-success-600);
}

.metric-card__trend--flat {
  color: var(--rt-color-info-600);
}
</style>
