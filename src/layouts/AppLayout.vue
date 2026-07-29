<script setup lang="ts">
import { storeToRefs } from 'pinia'

import { useAppStore } from '@/stores/app'

const TRANSITION_DURATION_MS = 200
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

const appStore = useAppStore()
const { sidebarCollapsed, mobileNavigationOpen } = storeToRefs(appStore)

function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

function runTransition(element: Element, keyframes: Keyframe[], done: () => void): void {
  if (!(element instanceof HTMLElement) || prefersReducedMotion()) {
    done()
    return
  }

  const animation = element.animate(keyframes, {
    duration: TRANSITION_DURATION_MS,
    easing: 'ease',
    fill: 'both',
  })

  let completed = false
  const complete = (): void => {
    if (completed) return
    completed = true
    done()
  }

  animation.addEventListener('finish', complete, { once: true })
  animation.addEventListener('cancel', complete, { once: true })
}

function enterOverlay(element: Element, done: () => void): void {
  runTransition(element, [{ opacity: 0 }, { opacity: 1 }], done)
}

function leaveOverlay(element: Element, done: () => void): void {
  runTransition(element, [{ opacity: 1 }, { opacity: 0 }], done)
}

function enterMobileSidebar(element: Element, done: () => void): void {
  runTransition(element, [{ transform: 'translateX(-100%)' }, { transform: 'translateX(0)' }], done)
}

function leaveMobileSidebar(element: Element, done: () => void): void {
  runTransition(element, [{ transform: 'translateX(0)' }, { transform: 'translateX(-100%)' }], done)
}
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

    <Transition :css="false" @enter="enterOverlay" @leave="leaveOverlay">
      <button
        v-if="mobileNavigationOpen"
        class="app-layout__overlay"
        type="button"
        aria-label="关闭移动导航"
        @click="appStore.closeMobileNavigation"
      />
    </Transition>

    <Transition :css="false" @enter="enterMobileSidebar" @leave="leaveMobileSidebar">
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
}
</style>
