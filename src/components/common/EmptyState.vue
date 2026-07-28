<script setup lang="ts">
const emit = defineEmits<{
  action: []
}>()

withDefaults(
  defineProps<{
    title: string
    description?: string
    actionLabel?: string
    compact?: boolean
  }>(),
  {
    description: undefined,
    actionLabel: undefined,
    compact: false,
  },
)
</script>

<template>
  <el-empty class="empty-state" :class="{ 'empty-state--compact': compact }">
    <template #description>
      <div class="empty-state__copy">
        <h3 class="empty-state__title">{{ title }}</h3>
        <p v-if="description" class="empty-state__description">{{ description }}</p>
      </div>
    </template>

    <slot name="action">
      <el-button v-if="actionLabel" type="primary" @click="emit('action')">
        {{ actionLabel }}
      </el-button>
    </slot>
  </el-empty>
</template>

<style scoped>
.empty-state {
  min-height: 280px;
  padding: var(--rt-space-8);
}

.empty-state--compact {
  min-height: 200px;
  padding: var(--rt-space-6);
}

.empty-state :deep(.el-empty__image) {
  width: calc(var(--rt-icon-size-state) + var(--rt-icon-size-state));
}

.empty-state--compact :deep(.el-empty__image) {
  width: calc(var(--rt-icon-size-state) + var(--rt-space-6));
}

.empty-state__copy {
  max-width: 520px;
  text-align: center;
}

.empty-state__title {
  color: var(--el-text-color-primary);
  font-size: var(--rt-font-size-lg);
  font-weight: 700;
}

.empty-state__description {
  margin-top: var(--rt-space-2);
  color: var(--el-text-color-secondary);
  font-size: var(--rt-font-size-sm);
}
</style>
