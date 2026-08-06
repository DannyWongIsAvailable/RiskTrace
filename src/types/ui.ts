import type { Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

export type StatusTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger'

export interface BreadcrumbItem {
  label: string
  to?: RouteLocationRaw
}

export interface NavigationItem {
  key: string
  label: string
  to: string
  icon: Component
  description?: string
  group?: string
  badge?: string
}

export interface SelectOption<T extends string | number = string> {
  label: string
  value: T
  disabled?: boolean
}

export interface DescriptionItem {
  key: string
  label: string
  value?: string | number | null
  span?: 1 | 2 | 3
}
