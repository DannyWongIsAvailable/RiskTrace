import { createRouter, createWebHistory } from 'vue-router'

import AppLayout from '@/layouts/AppLayout.vue'
import DashboardView from '@/views/DashboardView.vue'
import FeaturePlaceholderView from '@/views/FeaturePlaceholderView.vue'
import FoundationView from '@/views/FoundationView.vue'
import NotFoundView from '@/views/NotFoundView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: AppLayout,
      children: [
        {
          path: '',
          redirect: '/dashboard',
        },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: DashboardView,
          meta: {
            title: '风险总览',
            description: '关键指标与风险态势',
          },
        },
        {
          path: 'cases',
          name: 'cases',
          component: FeaturePlaceholderView,
          meta: {
            title: '风险事件',
            description: '管理采购事件、风险信号与可追溯证据链。',
          },
        },
        {
          path: 'tasks',
          name: 'tasks',
          component: FeaturePlaceholderView,
          meta: {
            title: '处置中心',
            description: '统一处理人工复核、材料补充、升级审批与付款控制任务。',
          },
        },
        {
          path: 'rules',
          name: 'rules',
          component: FeaturePlaceholderView,
          meta: {
            title: '规则中心',
            description: '维护业务规则、风险权重、处置策略与生效范围。',
          },
        },
        {
          path: 'foundation',
          name: 'foundation',
          component: FoundationView,
          meta: {
            title: '设计系统',
            description: '基础组件与视觉规范',
          },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFoundView,
      meta: {
        title: '页面不存在',
      },
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

router.afterEach((to) => {
  const title = String(to.meta.title ?? 'RiskTrace')
  document.title = `${title} · RiskTrace`
})

export default router
