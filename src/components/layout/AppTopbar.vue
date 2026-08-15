<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { AppIcons } from '@/icons'

const emit = defineEmits<{
  openNavigation: []
}>()

const route = useRoute()
const pageTitle = computed(() => {
  const title = route.meta['title']
  return typeof title === 'string' && title.trim() ? title : 'RiskTrace'
})
</script>

<template>
  <header class="app-topbar">
    <div class="app-topbar__leading">
      <button class="app-topbar__menu-button" type="button" @click="emit('openNavigation')">
        <el-icon class="app-topbar__menu-icon">
          <component :is="AppIcons.layout.menu" />
        </el-icon>
        <span>菜单</span>
      </button>
      <div class="app-topbar__page-context">
        <span class="app-topbar__page-title">{{ pageTitle }}</span>
        <span class="app-topbar__environment">采购合规审查</span>
      </div>
    </div>

    <div class="app-topbar__mode">
      <span class="app-topbar__mode-dot" />
      <span>自动审查</span>
    </div>
  </header>
</template>

<style scoped>
.app-topbar {
  position: sticky;
  z-index: var(--rt-z-topbar);
  top: 0;
  display: flex;
  min-height: var(--rt-topbar-height);
  align-items: center;
  justify-content: space-between;
  gap: var(--rt-space-4);
  padding: 0 var(--rt-space-6);
  border-bottom: 1px solid var(--rt-border-subtle);
  background: var(--rt-bg-topbar);
  backdrop-filter: blur(14px);
}

.app-topbar__leading,
.app-topbar__mode {
  display: flex;
  align-items: center;
}

.app-topbar__leading {
  gap: var(--rt-space-4);
}

.app-topbar__menu-button {
  display: none;
  min-height: 36px;
  align-items: center;
  gap: var(--rt-space-2);
  padding: 0 var(--rt-space-3);
  border: 1px solid var(--rt-border-default);
  border-radius: var(--rt-radius-md);
  background: var(--rt-bg-panel);
  color: var(--rt-text-secondary);
  cursor: pointer;
  font-size: var(--rt-font-size-sm);
  font-weight: 700;
}

.app-topbar__menu-icon {
  color: currentColor;
  font-size: var(--rt-icon-size-md);
}

.app-topbar__page-context {
  display: flex;
  flex-direction: column;
}

.app-topbar__page-title {
  color: var(--rt-text-primary);
  font-size: var(--rt-font-size-md);
  font-weight: 760;
}

.app-topbar__environment {
  margin-top: 2px;
  color: var(--rt-text-tertiary);
  font-size: 11px;
}

.app-topbar__mode {
  gap: var(--rt-space-2);
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
}

.app-topbar__mode-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--rt-radius-round);
  background: var(--rt-color-warning-500);
}

@media (max-width: 900px) {
  .app-topbar {
    padding: 0 var(--rt-space-4);
  }

  .app-topbar__menu-button {
    display: inline-flex;
  }
}

@media (max-width: 640px) {
  .app-topbar__mode,
  .app-topbar__environment {
    display: none;
  }
}
</style>
