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
  <div class="empty-state" :class="{ 'empty-state--compact': compact }">
    <div class="empty-state__graphic" aria-hidden="true">
      <span class="empty-state__line empty-state__line--top" />
      <span class="empty-state__line empty-state__line--middle" />
      <span class="empty-state__line empty-state__line--bottom" />
    </div>
    <h3 class="empty-state__title">{{ title }}</h3>
    <p v-if="description" class="empty-state__description">{{ description }}</p>
    <div v-if="$slots.action || actionLabel" class="empty-state__action">
      <slot name="action">
        <el-button v-if="actionLabel" type="primary" @click="emit('action')">
          {{ actionLabel }}
        </el-button>
      </slot>
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  min-height: 280px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: var(--rt-space-8);
  text-align: center;
}

.empty-state--compact {
  min-height: 200px;
  padding: var(--rt-space-6);
}

.empty-state__graphic {
  position: relative;
  width: 72px;
  height: 58px;
  margin-bottom: var(--rt-space-5);
  border: 1px solid var(--rt-color-primary-200);
  border-radius: var(--rt-radius-lg);
  background: var(--rt-color-primary-50);
}

.empty-state__graphic::before {
  position: absolute;
  top: 12px;
  left: 12px;
  width: 12px;
  height: 12px;
  border: 2px solid var(--rt-color-primary-400);
  border-radius: 50%;
  content: '';
}

.empty-state__line {
  position: absolute;
  right: 12px;
  height: 4px;
  border-radius: var(--rt-radius-round);
  background: var(--rt-color-primary-200);
}

.empty-state__line--top {
  top: 14px;
  width: 28px;
}

.empty-state__line--middle {
  top: 28px;
  left: 12px;
}

.empty-state__line--bottom {
  top: 40px;
  left: 12px;
  width: 32px;
}

.empty-state__title {
  color: var(--rt-text-primary);
  font-size: var(--rt-font-size-lg);
  font-weight: 700;
}

.empty-state__description {
  max-width: 520px;
  margin-top: var(--rt-space-2);
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-sm);
}

.empty-state__action {
  margin-top: var(--rt-space-5);
}
</style>
