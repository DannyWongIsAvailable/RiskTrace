export type StatusTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger'

export interface BreadcrumbItem {
  label: string
  to?: string
}

export interface NavigationItem {
  key: string
  label: string
  to: string
  description?: string
  group?: string
  badge?: string
  exact?: boolean
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
