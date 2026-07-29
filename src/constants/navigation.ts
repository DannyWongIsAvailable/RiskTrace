import type { Router } from 'vue-router'

import type { NavigationGroup } from '@/router/meta'
import type { NavigationItem } from '@/types/ui'

export function getNavigationItems(router: Router, group: NavigationGroup): NavigationItem[] {
  return router
    .getRoutes()
    .filter((route) => route.meta.navigation?.group === group)
    .sort(
      (left, right) =>
        (left.meta.navigation?.order ?? Number.MAX_SAFE_INTEGER) -
        (right.meta.navigation?.order ?? Number.MAX_SAFE_INTEGER),
    )
    .map((route) => {
      const navigation = route.meta.navigation

      if (!navigation) {
        throw new Error(`路由 ${route.path} 缺少导航配置`)
      }

      return {
        key: route.name ? String(route.name) : route.path,
        label: navigation.label ?? String(route.meta.title ?? route.name ?? route.path),
        to: route.path,
        icon: navigation.icon,
        description: navigation.description,
        badge: navigation.badge,
      }
    })
}
