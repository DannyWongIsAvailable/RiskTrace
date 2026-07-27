import { defineStore } from 'pinia'
import { ref } from 'vue'

const SIDEBAR_STORAGE_KEY = 'risktrace.sidebar-collapsed'

function readInitialSidebarState(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
}

export const useAppStore = defineStore('app', () => {
  const sidebarCollapsed = ref(readInitialSidebarState())
  const mobileNavigationOpen = ref(false)

  function setSidebarCollapsed(value: boolean): void {
    sidebarCollapsed.value = value

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(value))
    }
  }

  function toggleSidebar(): void {
    setSidebarCollapsed(!sidebarCollapsed.value)
  }

  function openMobileNavigation(): void {
    mobileNavigationOpen.value = true
  }

  function closeMobileNavigation(): void {
    mobileNavigationOpen.value = false
  }

  return {
    sidebarCollapsed,
    mobileNavigationOpen,
    setSidebarCollapsed,
    toggleSidebar,
    openMobileNavigation,
    closeMobileNavigation,
  }
})
