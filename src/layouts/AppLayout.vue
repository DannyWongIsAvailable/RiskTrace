<script setup lang="ts">
import { storeToRefs } from 'pinia'

import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const { sidebarCollapsed, mobileNavigationOpen } = storeToRefs(appStore)
</script>

<template>
  <div class="app-layout" :class="{ 'app-layout--collapsed': sidebarCollapsed }">
    <div class="app-layout__sidebar">
      <AppSidebar :collapsed="sidebarCollapsed" @toggle="appStore.toggleSidebar" />
    </div>

    <div class="app-layout__main">
      <AppTopbar @open-navigation="appStore.openMobileNavigation" />
      <main class="app-layout__content">
        <RouterView />
      </main>
    </div>

    <Transition name="app-layout-fade">
      <button
        v-if="mobileNavigationOpen"
        class="app-layout__overlay"
        type="button"
        aria-label="关闭导航"
        @click="appStore.closeMobileNavigation"
      />
    </Transition>

    <Transition name="app-layout-slide">
      <div v-if="mobileNavigationOpen" class="app-layout__mobile-sidebar">
        <AppSidebar mobile @navigate="appStore.closeMobileNavigation" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.app-layout {
  display: grid;
  min-height: 100vh;
  grid-template-columns: var(--rt-sidebar-width) minmax(0, 1fr);
  background: var(--rt-bg-page);
  transition: grid-template-columns var(--rt-duration-base) var(--rt-ease-standard);
}

.app-layout--collapsed {
  grid-template-columns: var(--rt-sidebar-collapsed-width) minmax(0, 1fr);
}

.app-layout__sidebar {
  position: sticky;
  z-index: var(--rt-z-sidebar);
  top: 0;
  height: 100vh;
}

.app-layout__main {
  min-width: 0;
}

.app-layout__content {
  min-height: calc(100vh - var(--rt-topbar-height));
}

.app-layout__overlay,
.app-layout__mobile-sidebar {
  display: none;
}

@media (max-width: 900px) {
  .app-layout,
  .app-layout--collapsed {
    display: block;
  }

  .app-layout__sidebar {
    display: none;
  }

  .app-layout__overlay {
    position: fixed;
    z-index: var(--rt-z-overlay);
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    background: var(--rt-bg-overlay);
    cursor: default;
  }

  .app-layout__mobile-sidebar {
    position: fixed;
    z-index: calc(var(--rt-z-overlay) + 1);
    top: 0;
    bottom: 0;
    left: 0;
    display: block;
    box-shadow: var(--rt-shadow-lg);
  }

  .app-layout-fade-enter-active,
  .app-layout-fade-leave-active,
  .app-layout-slide-enter-active,
  .app-layout-slide-leave-active {
    transition: all var(--rt-duration-base) var(--rt-ease-standard);
  }

  .app-layout-fade-enter-from,
  .app-layout-fade-leave-to {
    opacity: 0;
  }

  .app-layout-slide-enter-from,
  .app-layout-slide-leave-to {
    transform: translateX(-100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-layout,
  .app-layout-fade-enter-active,
  .app-layout-fade-leave-active,
  .app-layout-slide-enter-active,
  .app-layout-slide-leave-active {
    transition: none;
  }
}
</style>
