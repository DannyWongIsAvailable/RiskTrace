<script setup lang="ts">
const emit = defineEmits<{
  retry: []
}>()

withDefaults(
  defineProps<{
    title?: string
    description?: string
    retryLabel?: string
    compact?: boolean
  }>(),
  {
    title: '数据加载失败',
    description: '请检查网络连接后重试。若问题持续存在，请联系系统管理员。',
    retryLabel: '重新加载',
    compact: false,
  },
)
</script>

<template>
  <div class="error-state" :class="{ 'error-state--compact': compact }" role="alert">
    <div class="error-state__marker" aria-hidden="true">
      <span class="error-state__marker-bar" />
      <span class="error-state__marker-dot" />
    </div>
    <h3 class="error-state__title">{{ title }}</h3>
    <p class="error-state__description">{{ description }}</p>
    <el-button type="primary" plain @click="emit('retry')">{{ retryLabel }}</el-button>
  </div>
</template>

<style scoped>
.error-state {
  display: flex;
  min-height: 280px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: var(--rt-space-3);
  padding: var(--rt-space-8);
  text-align: center;
}

.error-state--compact {
  min-height: 200px;
  padding: var(--rt-space-6);
}

.error-state__marker {
  position: relative;
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border: 1px solid var(--rt-color-danger-200);
  border-radius: 50%;
  background: var(--rt-color-danger-50);
  color: var(--rt-color-danger-600);
}

.error-state__marker-bar {
  position: absolute;
  top: 11px;
  width: 3px;
  height: 16px;
  border-radius: var(--rt-radius-round);
  background: currentColor;
}

.error-state__marker-dot {
  position: absolute;
  bottom: 10px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
}

.error-state__title {
  color: var(--rt-text-primary);
  font-size: var(--rt-font-size-lg);
  font-weight: 700;
}

.error-state__description {
  max-width: 520px;
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-sm);
}
</style>
