<script setup lang="ts">
import type { BreadcrumbItem } from '@/types/ui'

withDefaults(
  defineProps<{
    title: string
    description?: string
    eyebrow?: string
    breadcrumbs?: BreadcrumbItem[]
  }>(),
  {
    description: undefined,
    eyebrow: undefined,
    breadcrumbs: () => [],
  },
)
</script>

<template>
  <header class="page-header">
    <div class="page-header__content">
      <el-breadcrumb v-if="breadcrumbs.length" class="page-header__breadcrumbs" separator="/">
        <el-breadcrumb-item
          v-for="(item, index) in breadcrumbs"
          :key="`${item.label}-${index}`"
          :to="item.to"
        >
          {{ item.label }}
        </el-breadcrumb-item>
      </el-breadcrumb>

      <p v-if="eyebrow" class="page-header__eyebrow">{{ eyebrow }}</p>
      <h1 class="page-header__title">{{ title }}</h1>
      <p v-if="description" class="page-header__description">{{ description }}</p>
    </div>

    <div v-if="$slots.actions" class="page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--rt-space-6);
}

.page-header__content {
  min-width: 0;
  max-width: 880px;
}

.page-header__breadcrumbs {
  margin-bottom: var(--rt-space-3);
}

.page-header__eyebrow {
  margin-bottom: var(--rt-space-2);
  color: var(--el-color-primary);
  font-size: var(--rt-font-size-xs);
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.page-header__title {
  color: var(--el-text-color-primary);
  font-size: clamp(24px, 2.3vw, 32px);
  font-weight: 760;
  letter-spacing: -0.03em;
  line-height: 1.2;
}

.page-header__description {
  margin-top: var(--rt-space-3);
  color: var(--el-text-color-regular);
  font-size: var(--rt-font-size-md);
}

.page-header__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: var(--rt-space-2);
}

@media (max-width: 720px) {
  .page-header {
    flex-direction: column;
  }

  .page-header__actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
