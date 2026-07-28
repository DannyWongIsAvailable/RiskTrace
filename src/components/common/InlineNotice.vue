<script setup lang="ts">
import { computed } from 'vue'

import type { StatusTone } from '@/types/ui'

type AlertType = 'primary' | 'success' | 'warning' | 'info' | 'error'

const emit = defineEmits<{
  close: []
}>()

const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    tone?: StatusTone
    closable?: boolean
    showIcon?: boolean
  }>(),
  {
    description: undefined,
    tone: 'neutral',
    closable: false,
    showIcon: true,
  },
)

const alertType = computed<AlertType>(() => {
  if (props.tone === 'primary') {
    return 'primary'
  }

  if (props.tone === 'success') {
    return 'success'
  }

  if (props.tone === 'warning') {
    return 'warning'
  }

  if (props.tone === 'danger') {
    return 'error'
  }

  return 'info'
})
</script>

<template>
  <el-alert
    class="inline-notice"
    :class="`inline-notice--${tone}`"
    :type="alertType"
    :closable="closable"
    :show-icon="showIcon"
    :role="tone === 'danger' ? 'alert' : 'status'"
    @close="emit('close')"
  >
    <template #title>
      <span class="inline-notice__title">{{ title }}</span>
    </template>

    <div v-if="description || $slots.default || $slots.actions" class="inline-notice__content">
      <div class="inline-notice__copy">
        <p v-if="description" class="inline-notice__description">{{ description }}</p>
        <div v-if="$slots.default" class="inline-notice__body">
          <slot />
        </div>
      </div>

      <div v-if="$slots.actions" class="inline-notice__actions">
        <slot name="actions" />
      </div>
    </div>
  </el-alert>
</template>

<style scoped>
.inline-notice {
  --el-alert-padding: var(--rt-space-4);
  align-items: flex-start;
}

.inline-notice__title {
  color: var(--el-text-color-primary);
  font-weight: 700;
}

.inline-notice__content {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--rt-space-4);
  width: 100%;
}

.inline-notice__copy {
  min-width: 0;
  flex: 1 1 auto;
}

.inline-notice__description,
.inline-notice__body {
  color: inherit;
  font-size: var(--rt-font-size-sm);
}

.inline-notice__body {
  margin-top: var(--rt-space-1);
}

.inline-notice__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--rt-space-2);
}

@media (max-width: 640px) {
  .inline-notice__content {
    flex-direction: column;
  }

  .inline-notice__actions {
    width: 100%;
  }
}
</style>
