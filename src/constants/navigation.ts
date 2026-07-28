import { AppIcons } from '@/icons'
import type { NavigationItem } from '@/types/ui'

export const mainNavigation: NavigationItem[] = [
  {
    key: 'dashboard',
    label: '风险总览',
    to: '/dashboard',
    icon: AppIcons.navigation.dashboard,
    description: '关键指标与风险态势',
    exact: true,
  },
  {
    key: 'cases',
    label: '风险事件',
    to: '/cases',
    icon: AppIcons.navigation.cases,
    description: '采购事件与证据链',
  },
  {
    key: 'tasks',
    label: '处置中心',
    to: '/tasks',
    icon: AppIcons.navigation.tasks,
    description: '复核、补件与处置任务',
  },
  {
    key: 'rules',
    label: '规则中心',
    to: '/rules',
    icon: AppIcons.navigation.rules,
    description: '规则、阈值与策略配置',
  },
]

export const supportNavigation: NavigationItem[] = [
  {
    key: 'foundation',
    label: '设计系统',
    to: '/foundation',
    icon: AppIcons.navigation.foundation,
    description: '基础组件与视觉规范',
    group: '工程支持',
  },
]
