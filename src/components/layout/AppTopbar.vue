<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { AppIcons } from '@/icons'
import { showPendingIntegration } from '@/utils/interaction'

const emit = defineEmits<{
  openNavigation: []
}>()

const route = useRoute()
const pageTitle = computed(() => {
  const title = route.meta['title']

  return typeof title === 'string' && title.trim() ? title : 'RiskTrace'
})
const environment = import.meta.env.MODE === 'production' ? '生产环境' : '开发环境'
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
        <span class="app-topbar__environment">{{ environment }}</span>
      </div>
    </div>

    <div class="app-topbar__actions">
      <div class="app-topbar__system-status">
        <span class="app-topbar__status-dot" />
        <span>系统运行正常</span>
      </div>
      <button class="app-topbar__profile" type="button" @click="showPendingIntegration">
        <span class="app-topbar__avatar">
          <el-icon class="app-topbar__avatar-icon">
            <component :is="AppIcons.account.user" />
          </el-icon>
        </span>
        <span class="app-topbar__profile-copy">
          <strong>系统管理员</strong>
          <span>账户与设置</span>
        </span>
      </button>
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
.app-topbar__actions,
.app-topbar__profile,
.app-topbar__system-status {
  display: flex;
  align-items: center;
}

.app-topbar__leading,
.app-topbar__actions {
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

.app-topbar__page-context,
.app-topbar__profile-copy {
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

.app-topbar__system-status {
  gap: var(--rt-space-2);
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
}

.app-topbar__status-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--rt-radius-round);
  background: var(--rt-color-success-600);
}

.app-topbar__profile {
  gap: var(--rt-space-3);
  padding: 0;
  background: transparent;
  color: var(--rt-text-primary);
  text-align: left;
}

.app-topbar__profile {
  cursor: pointer;
}

.app-topbar__profile:hover {
  opacity: 0.78;
}

.app-topbar__avatar {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid var(--rt-color-primary-200);
  border-radius: var(--rt-radius-round);
  background: var(--rt-color-primary-50);
  color: var(--rt-color-primary-700);
}

.app-topbar__avatar-icon {
  font-size: var(--rt-icon-size-md);
}

.app-topbar__profile-copy strong {
  font-size: var(--rt-font-size-sm);
}

.app-topbar__profile-copy span {
  margin-top: 2px;
  color: var(--rt-text-tertiary);
  font-size: 11px;
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
  .app-topbar__system-status,
  .app-topbar__profile-copy,
  .app-topbar__environment {
    display: none;
  }
}
</style>
