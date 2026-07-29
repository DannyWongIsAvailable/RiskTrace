import type { Component } from 'vue'
import 'vue-router'

export {}

export type NavigationGroup = 'main' | 'support'

export interface RouteNavigationMeta {
  group: NavigationGroup
  order: number
  icon: Component
  label?: string
  description?: string
  badge?: string
}

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    description?: string
    navigation?: RouteNavigationMeta
  }
}
