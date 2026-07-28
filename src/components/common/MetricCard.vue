<script setup lang="ts">
import { computed } from 'vue'

import type { StatusTone } from '@/types/ui'

type TagType = 'primary' | 'success' | 'info' | 'warning' | 'danger'

const props = withDefaults(
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

const trendType = computed<TagType>(() => {
  if (props.trendDirection === 'up') {
    return 'danger'
  }

  if (props.trendDirection === 'down') {
    return 'success'
  }

  return props.tone === 'neutral' ? 'info' : props.tone
})
</script>

<template>
  <BaseCard class="metric-card" padding="md">
    <div class="metric-card__content">
      <span class="metric-card__label">{{ label }}</span>
      <strong class="metric-card__value">{{ value }}</strong>

      <div v-if="description || trend" class="metric-card__meta">
        <span v-if="description" class="metric-card__description">{{ description }}</span>
        <el-tag
          v-if="trend"
          :type="trendType"
          effect="plain"
          size="small"
          round
          disable-transitions
        >
          {{ trend }}
        </el-tag>
      </div>
    </div>
  </BaseCard>
</template>

<style scoped>
.metric-card {
  min-height: 168px;
}

.metric-card__content {
  display: flex;
  min-height: 126px;
  flex-direction: column;
}

.metric-card__label {
  color: var(--el-text-color-regular);
  font-size: var(--rt-font-size-sm);
  font-weight: 700;
}

.metric-card__value {
  margin-top: var(--rt-space-4);
  color: var(--el-text-color-primary);
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
  margin-top: auto;
  padding-top: var(--rt-space-4);
}

.metric-card__description {
  min-width: 0;
  flex: 1 1 180px;
  color: var(--el-text-color-secondary);
  font-size: var(--rt-font-size-xs);
}
</style>
