<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    rows?: number
  }>(),
  {
    title: '正在加载数据',
    rows: 4,
  },
)
</script>

<template>
  <div class="loading-state" role="status" aria-live="polite">
    <span class="loading-state__label">{{ title }}</span>
    <div class="loading-state__rows" aria-hidden="true">
      <span v-for="row in rows" :key="row" class="loading-state__row" />
    </div>
  </div>
</template>

<style scoped>
.loading-state {
  padding: var(--rt-space-6);
}

.loading-state__label {
  display: block;
  margin-bottom: var(--rt-space-4);
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-sm);
}

.loading-state__rows {
  display: flex;
  flex-direction: column;
  gap: var(--rt-space-3);
}

.loading-state__row {
  display: block;
  height: 14px;
  overflow: hidden;
  border-radius: var(--rt-radius-round);
  background: linear-gradient(
    90deg,
    var(--rt-color-gray-100) 25%,
    var(--rt-color-gray-50) 50%,
    var(--rt-color-gray-100) 75%
  );
  background-size: 200% 100%;
  animation: loading-state-shimmer 1.4s infinite linear;
}

.loading-state__row:nth-child(2n) {
  width: 86%;
}

.loading-state__row:nth-child(3n) {
  width: 72%;
}

@keyframes loading-state-shimmer {
  from {
    background-position: 200% 0;
  }

  to {
    background-position: -200% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .loading-state__row {
    animation: none;
  }
}
</style>
